import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import type { AuthContext } from '../../utils/auth-context';
import type { QuoteRequest, QuoteRequestStatus, Prisma } from '@prisma/client';

/**
 * CO-2-06 — QuoteRequest service.
 *
 * Fluxo:
 *   1. FSM/Form web cria QuoteRequest com status PENDING_REVIEW (via `createFromFsm`).
 *   2. Comprador lista, abre detalhe e promove → cria Quote em AWAITING_BUYER_REVIEW.
 *   3. Comprador pode rejeitar com motivo (status REJECTED).
 *
 * RBAC:
 *   - REQUESTER: cria via WhatsApp/form, vê apenas suas próprias.
 *   - BUYER/ADMIN: list/get/promote/reject de tudo do tenant.
 *   - APPROVER: read-only.
 */

export interface QuoteRequestItem {
  description: string;
  qty?: number | null;
  unit?: string | null;
  spec?: string | null;
  materialId?: string | null;
}

export interface CreateQuoteRequestInput {
  tenantId: string;
  siteId: string;
  requesterId: string;
  items: QuoteRequestItem[];
  deadlineAt?: Date | null;
  observation?: string | null;
  source?: 'whatsapp' | 'form' | 'panel';
  rawText?: string | null;
}

export interface PromoteInput {
  // Itens revisados pelo comprador (podem ter sido editados)
  items: Array<QuoteRequestItem & { qty: number; unit: string }>;
  region?: string;
  deadline: Date;
  observations?: string;
  freight?: string; // CIF | FOB
  paymentTerms?: string;
  supplierScope: 'MINE' | 'NETWORK' | 'ALL';
  expiryHours?: number; // default 24
}

export class QuoteRequestService {
  /**
   * Criação via FSM ou form web (sem AuthContext humano — interna).
   */
  static async createFromFsm(input: CreateQuoteRequestInput): Promise<QuoteRequest> {
    // Valida que site pertence ao tenant
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, tenantId: input.tenantId },
    });
    if (!site) {
      throw createError.badRequest('Obra inválida para este tenant');
    }

    // Valida que user pertence ao tenant
    const user = await prisma.user.findFirst({
      where: { id: input.requesterId, tenantId: input.tenantId },
    });
    if (!user) {
      throw createError.badRequest('Solicitante não vinculado a este tenant');
    }

    const created = await prisma.quoteRequest.create({
      data: {
        tenantId: input.tenantId,
        siteId: input.siteId,
        requesterId: input.requesterId,
        items: input.items as unknown as Prisma.JsonArray,
        deadlineAt: input.deadlineAt ?? null,
        observation: input.observation ?? null,
        source: input.source ?? 'whatsapp',
        rawText: input.rawText ?? null,
        status: 'PENDING_REVIEW',
      },
    });

    logger.info('quote_request.created', {
      id: created.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      requesterId: input.requesterId,
      itemCount: input.items.length,
      source: created.source,
    });

    return created;
  }

  /**
   * Lista solicitações com filtro por status (default: PENDING_REVIEW).
   */
  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 20,
    filters?: { status?: QuoteRequestStatus; siteId?: string },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.QuoteRequestWhereInput = {};

    if (ctx.role !== 'SUPER_ADMIN') {
      where.tenantId = ctx.tenantId;
    }

    // REQUESTER vê apenas suas próprias solicitações
    if (ctx.role === 'REQUESTER') {
      where.requesterId = ctx.userId;
    }

    if (filters?.status) where.status = filters.status;
    if (filters?.siteId) where.siteId = filters.siteId;

    const [data, total] = await Promise.all([
      prisma.quoteRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          site: { select: { id: true, name: true, city: true, state: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.quoteRequest.count({ where }),
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
    if (ctx.role === 'REQUESTER') return 0; // não mostra badge pra solicitante
    return prisma.quoteRequest.count({
      where: {
        tenantId: ctx.tenantId,
        status: 'PENDING_REVIEW',
      },
    });
  }

  static async getById(ctx: AuthContext, id: string): Promise<QuoteRequest> {
    const where: Prisma.QuoteRequestWhereInput = { id };
    if (ctx.role !== 'SUPER_ADMIN') where.tenantId = ctx.tenantId;
    if (ctx.role === 'REQUESTER') where.requesterId = ctx.userId;

    const qr = await prisma.quoteRequest.findFirst({
      where,
      include: {
        site: true,
        requester: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!qr) throw createError.notFound('Solicitação não encontrada');
    return qr;
  }

  /**
   * Promove a solicitação para uma Quote real. Cria Quote + QuoteItems
   * em transação. Marca QuoteRequest como PROMOTED com link para a Quote.
   */
  static async promote(
    ctx: AuthContext,
    id: string,
    input: PromoteInput,
  ): Promise<{ quoteRequest: QuoteRequest; quoteId: string }> {
    // Apenas BUYER/ADMIN podem promover
    if (ctx.role !== 'BUYER' && ctx.role !== 'ADMIN' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Apenas comprador/admin pode promover solicitações');
    }

    const qr = await this.getById(ctx, id);
    if (qr.status !== 'PENDING_REVIEW') {
      throw createError.badRequest(
        `Solicitação está em status ${qr.status}; não pode ser promovida novamente`,
      );
    }

    const expiryHours = input.expiryHours ?? 24;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Pega o producer "shim" (legacy do schema) — Quote ainda exige producerId
    // até remoção definitiva na Sprint 3. Estratégia: pegar/criar 1 Producer
    // canônico do tenant ("requester legacy proxy") para satisfazer a FK.
    // Idealmente Sprint 3 remove esse hack.
    const proxyProducer = await this.ensureLegacyProducerForUser(qr.tenantId, qr.requesterId);

    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          tenantId: qr.tenantId,
          producerId: proxyProducer.id,
          siteId: qr.siteId,
          region: input.region ?? '',
          deadline: input.deadline,
          observations: input.observations,
          freight: input.freight,
          paymentTerms: input.paymentTerms,
          supplierScope: input.supplierScope,
          status: 'PENDING',
          expiresAt,
        },
      });

      // Cria QuoteItems a partir dos itens revisados
      for (const item of input.items) {
        await tx.quoteItem.create({
          data: {
            quoteId: quote.id,
            product: item.description,
            quantity: item.qty,
            unit: item.unit,
            // Spec/materialId armazenados no item via metadados opcionais
            // (modelo QuoteItem do cotaAgro pode não ter spec — verificar)
          },
        });
      }

      const updatedQr = await tx.quoteRequest.update({
        where: { id: qr.id },
        data: {
          status: 'PROMOTED',
          promotedQuoteId: quote.id,
          promotedAt: new Date(),
          reviewedById: ctx.userId,
        },
      });

      return { quoteRequest: updatedQr, quoteId: quote.id };
    });

    logger.info('quote_request.promoted', {
      id,
      quoteId: result.quoteId,
      reviewedBy: ctx.userId,
      tenantId: qr.tenantId,
    });

    return result;
  }

  static async reject(ctx: AuthContext, id: string, reason: string): Promise<QuoteRequest> {
    if (ctx.role !== 'BUYER' && ctx.role !== 'ADMIN' && ctx.role !== 'SUPER_ADMIN') {
      throw createError.forbidden('Apenas comprador/admin pode rejeitar solicitações');
    }

    const qr = await this.getById(ctx, id);
    if (qr.status !== 'PENDING_REVIEW') {
      throw createError.badRequest(
        `Solicitação está em status ${qr.status}; não pode ser rejeitada`,
      );
    }

    const updated = await prisma.quoteRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedById: ctx.userId,
      },
    });

    logger.info('quote_request.rejected', {
      id,
      reason,
      reviewedBy: ctx.userId,
      tenantId: qr.tenantId,
    });

    return updated;
  }

  /**
   * Garante existência de um Producer legacy "proxy" para o user/tenant.
   * Hack temporário até a Sprint 3 remover Quote.producerId.
   */
  private static async ensureLegacyProducerForUser(
    tenantId: string,
    userId: string,
  ) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, phone: true },
    });

    const phone = user.phone || `+55_user_${userId.slice(0, 8)}`;

    // findFirst + create idempotente
    const existing = await prisma.producer.findFirst({
      where: { tenantId, phone },
    });
    if (existing) return existing;

    return prisma.producer.create({
      data: {
        tenantId,
        name: user.name,
        cpfCnpj: `LEGACY-${userId.slice(0, 12)}`,
        city: 'N/A',
        phone,
        region: 'N/A',
      },
    });
  }
}
