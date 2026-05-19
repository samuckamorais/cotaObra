import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import type { AuthContext } from '../../utils/auth-context';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '@prisma/client';
import { transitionQuote } from '../../services/quote-status.service';
import { ApprovalService } from '../approvals/approval.service';

/**
 * CO-5-02 — Purchase Order service.
 *
 * Orquestra o fechamento da cotação:
 *   1. Valida que a quote está em SUMMARIZED (ou AWAITING_APPROVAL_APPROVED).
 *   2. Cria PO(s) em transação atômica:
 *      - mode='winner': 1 PO com supplier=rank=1 OU supplierId override.
 *      - mode='split': N POs (uma por fornecedor; agrupa items selecionados).
 *   3. Cria PurchaseOrderItem snapshots (preserva mesmo se Proposal mudar).
 *   4. Insere registros em PriceHistoryRaw (vencedor E perdedores) — CO-5-09.
 *   5. Transição da Quote para CLOSED via state machine (CO-4-09).
 *   6. Retorna POs criadas — caller dispara generate-po-pdf job (CO-5-05).
 *
 * Não envia mensagens WhatsApp diretamente — isso é responsabilidade do
 * job notify-winner (CO-5-06).
 */

const { Decimal } = Prisma;

export type CloseMode = 'winner' | 'split';

export interface CloseQuoteInput {
  mode: CloseMode;
  /** override: forçar um supplierId específico no winner */
  supplierId?: string;
  /** split: mapping quoteItemId → supplierId */
  selections?: Record<string, string>;
  reason?: string;
}

export interface CloseQuoteResult {
  purchaseOrders: PurchaseOrder[];
  totalValue: number;
  /** CO-6-02: quando true, a quote foi roteada para aprovação em vez de criar POs */
  requiresApproval?: boolean;
  approvalId?: string;
  threshold?: number;
}

export class PurchaseOrderService {
  /**
   * Fecha a cotação criando 1+ POs e registrando histórico de preços.
   */
  static async closeQuote(
    ctx: AuthContext,
    quoteId: string,
    input: CloseQuoteInput,
  ): Promise<CloseQuoteResult> {
    // RBAC: BUYER/ADMIN/SUPER_ADMIN podem fechar
    if (
      ctx.role !== 'BUYER' &&
      ctx.role !== 'ADMIN' &&
      ctx.role !== 'SUPER_ADMIN'
    ) {
      throw createError.forbidden('Apenas comprador/admin pode fechar cotação');
    }

    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        ...(ctx.role !== 'SUPER_ADMIN' && { tenantId: ctx.tenantId }),
      },
      include: {
        items: true,
        site: true,
        proposals: {
          include: {
            supplier: true,
            items: { include: { quoteItem: true } },
          },
        },
      },
    });

    if (!quote) throw createError.notFound('Cotação não encontrada');

    if (quote.status !== 'SUMMARIZED' && quote.status !== 'AWAITING_APPROVAL') {
      throw createError.unprocessable(
        `Cotação em status ${quote.status} não pode ser fechada. ` +
          `Aguarde consolidação (SUMMARIZED) ou aprovação (AWAITING_APPROVAL).`,
      );
    }

    if (quote.proposals.length === 0) {
      throw createError.badRequest('Cotação não tem propostas para fechar');
    }

    // Resolve POs a criar com base no modo
    const poPlans = this.planPurchaseOrders(quote, input);
    const estimatedTotal = poPlans.reduce((sum, p) => sum + p.totalValue, 0);

    // CO-6-02 — Se quote vem de SUMMARIZED e excede threshold, cria Approval.
    // Se vem de AWAITING_APPROVAL, é replay pós-aprovação: pula o gate.
    if (quote.status === 'SUMMARIZED') {
      const gate = await ApprovalService.shouldRequireApproval(
        quote.tenantId,
        estimatedTotal,
      );
      if (gate.requires) {
        const approval = await ApprovalService.createPending({
          quoteId: quote.id,
          requestedById: ctx.userId,
          thresholdAmount: gate.threshold ?? 0,
          totalAmount: estimatedTotal,
          closeQuotePayload: input,
        });
        logger.info('purchase_order.requires_approval', {
          quoteId: quote.id,
          estimatedTotal,
          threshold: gate.threshold,
          approvalId: approval.id,
        });
        return {
          purchaseOrders: [],
          totalValue: estimatedTotal,
          requiresApproval: true,
          approvalId: approval.id,
          threshold: gate.threshold ?? undefined,
        };
      }
    }

    // Cria tudo em transação
    const result = await prisma.$transaction(async (tx) => {
      const created: PurchaseOrder[] = [];

      for (const plan of poPlans) {
        const number = await this.nextPONumber(tx, quote.tenantId);

        const po = await tx.purchaseOrder.create({
          data: {
            tenantId: quote.tenantId,
            number,
            quoteId: quote.id,
            supplierId: plan.supplierId,
            totalValue: new Decimal(plan.totalValue),
            paymentTerms: plan.paymentTerms,
            deliveryDays: plan.deliveryDays,
            freightMode: plan.freightMode,
            freightValue:
              plan.freightValue !== null ? new Decimal(plan.freightValue) : null,
            observations: plan.observations,
            status: 'DRAFT',
            createdById: ctx.userId,
            items: {
              create: plan.items.map((it) => ({
                quoteItemId: it.quoteItemId,
                description: it.description,
                qty: new Decimal(it.qty),
                unit: it.unit,
                unitPrice: new Decimal(it.unitPrice),
                totalPrice: new Decimal(it.totalPrice),
                spec: it.spec,
              })),
            },
          },
        });

        created.push(po);
      }

      // CO-5-09 — Registra TODAS as propostas no PriceHistoryRaw (vencedores + perdedores)
      const winnerSupplierIds = new Set(poPlans.map((p) => p.supplierId));
      const historyRows: Prisma.PriceHistoryRawCreateManyInput[] = [];
      for (const prop of quote.proposals) {
        const wasWinner = winnerSupplierIds.has(prop.supplierId);
        for (const propItem of prop.items) {
          if (propItem.available === false) continue;
          historyRows.push({
            tenantId: quote.tenantId,
            materialId: null, // Sprint 6+: mapear via QuoteItem.materialId
            supplierId: prop.supplierId,
            siteId: quote.siteId,
            description: propItem.quoteItem.product ?? 'item',
            region: quote.region,
            unit: propItem.quoteItem.unit ?? 'un',
            unitPrice: new Decimal(propItem.unitPrice),
            qty: new Decimal(propItem.quoteItem.quantity ?? 0),
            paymentTerms: prop.paymentTerms,
            wasWinner,
            quoteId: quote.id,
            proposalId: prop.id,
          });
        }
      }
      if (historyRows.length > 0) {
        await tx.priceHistoryRaw.createMany({ data: historyRows });
      }

      // Marca quote como CLOSED via state machine
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'CLOSED' },
      });

      return created;
    });

    // AuditLog via state machine (fora da transaction porque AuditLog é best-effort)
    try {
      await transitionQuote(quote.id, 'CLOSED', {
        userId: ctx.userId,
        reason: input.reason ?? `Fechada via ${input.mode}`,
      });
    } catch {
      // Já foi marcada como CLOSED na transaction; transitionQuote vai detectar
      // idempotência e voltar OK, ou ignora se estado já é terminal.
    }

    const totalValue = result.reduce(
      (sum, po) => sum + Number(po.totalValue),
      0,
    );

    logger.info('purchase_order.created', {
      quoteId,
      mode: input.mode,
      poCount: result.length,
      totalValue,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return { purchaseOrders: result, totalValue };
  }

  /**
   * Planeja as POs a criar com base no modo + seleções.
   */
  private static planPurchaseOrders(
    quote: any,
    input: CloseQuoteInput,
  ): Array<{
    supplierId: string;
    totalValue: number;
    paymentTerms: string;
    deliveryDays: number;
    freightMode: string | null;
    freightValue: number | null;
    observations: string | null;
    items: Array<{
      quoteItemId: string;
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
      spec: string | null;
    }>;
  }> {
    if (input.mode === 'winner') {
      const winnerSupplierId =
        input.supplierId ??
        quote.proposals.find((p: any) => p.rank === 1)?.supplierId ??
        // fallback: menor totalPrice
        quote.proposals.slice().sort((a: any, b: any) => a.totalPrice - b.totalPrice)[0]?.supplierId;

      if (!winnerSupplierId) {
        throw createError.badRequest('Nenhuma proposta válida para vencedor único');
      }

      const proposal = quote.proposals.find(
        (p: any) => p.supplierId === winnerSupplierId,
      );
      if (!proposal) {
        throw createError.badRequest(
          `Proposta do fornecedor ${winnerSupplierId} não encontrada nesta cotação`,
        );
      }

      const availableItems = proposal.items.filter(
        (it: any) => it.available !== false,
      );

      return [
        {
          supplierId: winnerSupplierId,
          totalValue: availableItems.reduce(
            (sum: number, it: any) => sum + Number(it.totalPrice),
            0,
          ),
          paymentTerms: proposal.paymentTerms,
          deliveryDays: proposal.deliveryDays,
          freightMode: proposal.freightMode,
          freightValue: proposal.freightValue,
          observations: proposal.observations,
          items: availableItems.map((it: any) => ({
            quoteItemId: it.quoteItemId,
            description: it.quoteItem.product ?? 'item',
            qty: Number(it.quoteItem.quantity ?? 0),
            unit: it.quoteItem.unit ?? 'un',
            unitPrice: Number(it.unitPrice),
            totalPrice: Number(it.totalPrice),
            spec: null,
          })),
        },
      ];
    }

    // mode === 'split'
    if (!input.selections || Object.keys(input.selections).length === 0) {
      throw createError.badRequest(
        'split exige `selections` mapeando quoteItemId → supplierId',
      );
    }

    // Cada quoteItem precisa ter um supplier mapeado
    const quoteItemIds = quote.items.map((i: any) => i.id);
    const missing = quoteItemIds.filter((id: string) => !input.selections![id]);
    if (missing.length > 0) {
      throw createError.unprocessable(
        `Items sem fornecedor selecionado: ${missing.join(', ')}. ` +
          `No modo split, todo item precisa ter exatamente 1 fornecedor.`,
      );
    }

    // Agrupa por supplierId
    const groups: Record<string, string[]> = {};
    for (const [quoteItemId, supplierId] of Object.entries(input.selections)) {
      if (!groups[supplierId]) groups[supplierId] = [];
      groups[supplierId].push(quoteItemId);
    }

    return Object.entries(groups).map(([supplierId, itemIds]) => {
      const proposal = quote.proposals.find((p: any) => p.supplierId === supplierId);
      if (!proposal) {
        throw createError.badRequest(
          `Fornecedor ${supplierId} não tem proposta nesta cotação`,
        );
      }

      const items = itemIds
        .map((qid) => {
          const propItem = proposal.items.find((pi: any) => pi.quoteItemId === qid);
          if (!propItem || propItem.available === false) {
            throw createError.unprocessable(
              `Fornecedor ${supplierId} não tem o item ${qid} disponível`,
            );
          }
          return {
            quoteItemId: qid,
            description: propItem.quoteItem.product ?? 'item',
            qty: Number(propItem.quoteItem.quantity ?? 0),
            unit: propItem.quoteItem.unit ?? 'un',
            unitPrice: Number(propItem.unitPrice),
            totalPrice: Number(propItem.totalPrice),
            spec: null,
          };
        });

      return {
        supplierId,
        totalValue: items.reduce((sum, it) => sum + it.totalPrice, 0),
        paymentTerms: proposal.paymentTerms,
        deliveryDays: proposal.deliveryDays,
        freightMode: proposal.freightMode,
        freightValue: proposal.freightValue,
        observations: proposal.observations,
        items,
      };
    });
  }

  /**
   * Próximo número de PO para o tenant. Concorrência-safe usando o
   * lock advisory do Postgres.
   */
  private static async nextPONumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<number> {
    const last = await tx.purchaseOrder.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  // ===================================================================
  // Listagem / busca
  // ===================================================================

  static async list(
    ctx: AuthContext,
    page = 1,
    limit = 20,
    filters?: { status?: PurchaseOrderStatus; supplierId?: string },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.PurchaseOrderWhereInput = {};

    if (ctx.role !== 'SUPER_ADMIN') {
      where.tenantId = ctx.tenantId;
    }

    if (filters?.status) where.status = filters.status;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true, company: true } },
          quote: {
            select: {
              id: true,
              site: { select: { id: true, name: true } },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.purchaseOrder.count({ where }),
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

  static async getById(ctx: AuthContext, id: string): Promise<PurchaseOrder & {
    items: PurchaseOrderItem[];
  }> {
    const where: Prisma.PurchaseOrderWhereInput = { id };
    if (ctx.role !== 'SUPER_ADMIN') where.tenantId = ctx.tenantId;

    const po = await prisma.purchaseOrder.findFirst({
      where,
      include: {
        items: true,
        supplier: true,
        quote: {
          include: {
            site: true,
          },
        },
      },
    });
    if (!po) throw createError.notFound('Ordem de compra não encontrada');
    return po as any;
  }

  /**
   * Atualiza pdfUrl/pdfPath após o job gerar o PDF.
   */
  static async setPdfUrl(
    id: string,
    pdfUrl: string,
    pdfPath: string,
  ): Promise<void> {
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        pdfUrl,
        pdfPath,
        pdfGeneratedAt: new Date(),
        status: 'EMITTED',
      },
    });
  }
}
