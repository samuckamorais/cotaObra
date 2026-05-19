import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import type { AuthContext } from '../../utils/auth-context';
import type { Approval, ApprovalStatus } from '@prisma/client';
import { transitionQuote } from '../../services/quote-status.service';
import { NotifyApproverService } from '../../services/notify-approver.service';

/**
 * CO-6-02 — Approval service.
 *
 * Fluxo:
 *   1. Buyer chama closeQuote com escolha (winner/split + selections).
 *   2. PurchaseOrderService.shouldRequireApproval verifica se valor estimado
 *      excede TenantSettings.approvalThreshold. Se sim, em vez de criar PO,
 *      cria Approval em PENDING + transiciona Quote para AWAITING_APPROVAL.
 *   3. Aprovador (APPROVER ou ADMIN) aprova ou rejeita.
 *   4. Approve → re-executa closeQuote com payload original.
 *      Reject → Quote volta para SUMMARIZED + flag rejectionReason.
 */

const { Decimal } = Prisma;

export interface ApprovalRequestInput {
  quoteId: string;
  requestedById: string;
  thresholdAmount: number;
  totalAmount: number;
  closeQuotePayload: any;
}

export class ApprovalService {
  /**
   * Calcula se a escolha de fechamento excede o threshold do tenant.
   * Retorna `{ requires, threshold, total }`.
   */
  static async shouldRequireApproval(
    tenantId: string,
    estimatedTotal: number,
  ): Promise<{ requires: boolean; threshold: number | null }> {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { approvalThreshold: true },
    });
    const threshold = settings?.approvalThreshold
      ? Number(settings.approvalThreshold)
      : null;
    if (threshold === null || threshold <= 0) {
      return { requires: false, threshold };
    }
    return { requires: estimatedTotal > threshold, threshold };
  }

  /**
   * Cria Approval em PENDING e transiciona Quote para AWAITING_APPROVAL.
   * Resolve um aprovador padrão (qualquer User APPROVER do tenant). Se múltiplos,
   * pega o primeiro pelo createdAt.
   */
  static async createPending(input: ApprovalRequestInput): Promise<Approval> {
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: input.quoteId },
      select: { tenantId: true, status: true },
    });

    // Já existe approval para essa quote?
    const existing = await prisma.approval.findUnique({ where: { quoteId: input.quoteId } });
    if (existing && existing.status === 'PENDING') {
      throw createError.conflict('Já existe uma aprovação pendente para esta cotação');
    }

    // Resolve aprovador disponível (pode ser null — todos APPROVERs do tenant veem na fila)
    const defaultApprover = await prisma.user.findFirst({
      where: { tenantId: quote.tenantId, role: 'APPROVER', active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const approval = await prisma.approval.create({
      data: {
        tenantId: quote.tenantId,
        quoteId: input.quoteId,
        requestedById: input.requestedById,
        approverId: defaultApprover?.id ?? null,
        status: 'PENDING',
        thresholdAmount: new Decimal(input.thresholdAmount),
        totalAmount: new Decimal(input.totalAmount),
        closeQuotePayload: input.closeQuotePayload,
      },
    });

    // Transiciona Quote para AWAITING_APPROVAL
    try {
      await transitionQuote(input.quoteId, 'AWAITING_APPROVAL', {
        userId: input.requestedById,
        reason: `Valor R$ ${input.totalAmount.toFixed(2)} excede teto R$ ${input.thresholdAmount.toFixed(2)}`,
      });
    } catch (err: any) {
      logger.warn('approval.transition_failed', { quoteId: input.quoteId, err: err?.message });
    }

    logger.info('approval.created', {
      approvalId: approval.id,
      quoteId: input.quoteId,
      total: input.totalAmount,
      threshold: input.thresholdAmount,
    });

    // CO-6-04 — notifica aprovador(es) por WhatsApp (fire-and-forget)
    void NotifyApproverService.notify(approval.id).catch((err) => {
      logger.warn('approval.notify_failed', { approvalId: approval.id, err: err?.message });
    });

    return approval;
  }

  // ============== Listagem / detalhe ==============

  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 20,
    filters?: { status?: ApprovalStatus },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.ApprovalWhereInput = {};

    if (ctx.role !== 'SUPER_ADMIN') {
      where.tenantId = ctx.tenantId;
    }

    // APPROVER vê suas próprias OU sem approverId definido (fila aberta)
    if (ctx.role === 'APPROVER') {
      where.OR = [{ approverId: ctx.userId }, { approverId: null }];
    }

    if (filters?.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        skip,
        take: limit,
        include: {
          quote: {
            select: {
              id: true,
              region: true,
              deadline: true,
              site: { select: { id: true, name: true } },
            },
          },
          requestedBy: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.approval.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  static async countPending(ctx: AuthContext): Promise<number> {
    const where: Prisma.ApprovalWhereInput = { status: 'PENDING' };
    if (ctx.role !== 'SUPER_ADMIN') where.tenantId = ctx.tenantId;
    if (ctx.role === 'APPROVER') {
      where.OR = [{ approverId: ctx.userId }, { approverId: null }];
    }
    return prisma.approval.count({ where });
  }

  static async getById(ctx: AuthContext, id: string): Promise<Approval> {
    const where: Prisma.ApprovalWhereInput = { id };
    if (ctx.role !== 'SUPER_ADMIN') where.tenantId = ctx.tenantId;

    const approval = await prisma.approval.findFirst({
      where,
      include: {
        quote: {
          include: {
            site: true,
            proposals: {
              include: { supplier: { select: { id: true, name: true } } },
              orderBy: { rank: 'asc' },
            },
          },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });
    if (!approval) throw createError.notFound('Aprovação não encontrada');
    return approval;
  }

  // ============== Decisão ==============

  /**
   * Aprovador decide. Retorna `{ approval, action: 'approved' | 'rejected' }`.
   * Caller (controller) é responsável por reaplicar `closeQuote` no caso APPROVED.
   */
  static async approve(ctx: AuthContext, id: string): Promise<Approval> {
    if (
      ctx.role !== 'APPROVER' &&
      ctx.role !== 'ADMIN' &&
      ctx.role !== 'SUPER_ADMIN'
    ) {
      throw createError.forbidden('Apenas APPROVER ou ADMIN podem aprovar');
    }

    const approval = await this.getById(ctx, id);
    if (approval.status !== 'PENDING') {
      throw createError.unprocessable(
        `Aprovação está em status ${approval.status}; só pendentes podem ser decididas.`,
      );
    }

    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: ctx.userId,
        decidedAt: new Date(),
      },
    });

    logger.info('approval.approved', {
      approvalId: id,
      quoteId: approval.quoteId,
      approver: ctx.userId,
    });

    return updated;
  }

  static async reject(
    ctx: AuthContext,
    id: string,
    reason: string,
  ): Promise<Approval> {
    if (
      ctx.role !== 'APPROVER' &&
      ctx.role !== 'ADMIN' &&
      ctx.role !== 'SUPER_ADMIN'
    ) {
      throw createError.forbidden('Apenas APPROVER ou ADMIN podem rejeitar');
    }

    if (!reason || reason.trim().length < 5) {
      throw createError.badRequest('Motivo de rejeição obrigatório (≥ 5 chars)');
    }

    const approval = await this.getById(ctx, id);
    if (approval.status !== 'PENDING') {
      throw createError.unprocessable(
        `Aprovação está em status ${approval.status}; só pendentes podem ser decididas.`,
      );
    }

    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: ctx.userId,
        decidedAt: new Date(),
        reason: reason.trim(),
      },
    });

    // Volta Quote para SUMMARIZED — comprador pode escolher outra opção
    try {
      await transitionQuote(approval.quoteId, 'SUMMARIZED', {
        userId: ctx.userId,
        reason: `Aprovação rejeitada: ${reason.trim().slice(0, 100)}`,
      });
    } catch (err: any) {
      logger.warn('approval.reject_transition_failed', {
        quoteId: approval.quoteId,
        err: err?.message,
      });
    }

    logger.info('approval.rejected', {
      approvalId: id,
      quoteId: approval.quoteId,
      approver: ctx.userId,
      reason,
    });

    return updated;
  }
}
