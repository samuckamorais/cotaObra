import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { createError } from '../utils/error-handler';
import type { QuoteStatus, Quote } from '@prisma/client';

/**
 * CO-4-09 — Máquina de estados explícita da Quote.
 *
 * Mapeamento canônico de transições permitidas. Estados terminais (sem
 * saída) são CLOSED, EXPIRED, CANCELLED.
 */
export const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  PENDING: ['AWAITING_BUYER_REVIEW', 'COLLECTING', 'CANCELLED'],
  AWAITING_BUYER_REVIEW: ['COLLECTING', 'CANCELLED'],
  COLLECTING: ['SUMMARIZED', 'EXPIRED', 'CANCELLED'],
  SUMMARIZED: ['AWAITING_APPROVAL', 'CLOSED', 'CANCELLED'],
  AWAITING_APPROVAL: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export interface TransitionContext {
  /** Usuário que está executando a transição (null = system/job). */
  userId?: string | null;
  /** Razão livre da transição. Obrigatório para CANCELLED. */
  reason?: string;
}

/**
 * Aplica uma transição de status validando que é permitida. Lança 422 se
 * a transição não é permitida do estado atual.
 */
export async function transitionQuote(
  quoteId: string,
  newStatus: QuoteStatus,
  ctx: TransitionContext = {},
): Promise<Quote> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!quote) throw createError.notFound('Cotação não encontrada');

  // Idempotente: re-aplicar mesmo status não é erro
  if (quote.status === newStatus) {
    return prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
  }

  const allowed = ALLOWED_TRANSITIONS[quote.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw createError.unprocessable(
      `Transição inválida: ${quote.status} → ${newStatus}. ` +
        `Permitidas: ${allowed.join(', ') || '(estado terminal)'}.`,
    );
  }

  if (newStatus === 'CANCELLED' && (!ctx.reason || ctx.reason.trim().length < 3)) {
    throw createError.badRequest('Motivo da cancelamento é obrigatório (≥ 3 chars)');
  }

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: { status: newStatus },
  });

  // AuditLog: apenas quando userId conhecido (transições de cron são logged via logger).
  if (ctx.userId) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: ctx.userId,
          action: 'quote.status.transitioned',
          targetType: 'Quote',
          targetId: quoteId,
          tenantId: quote.tenantId,
          reason: ctx.reason ?? `${quote.status} → ${newStatus}`,
        },
      });
    } catch (err: any) {
      logger.warn('quote.status.audit_failed', { quoteId, err: err?.message });
    }
  }

  logger.info('quote.status.transitioned', {
    quoteId,
    from: quote.status,
    to: newStatus,
    userId: ctx.userId,
    reason: ctx.reason,
  });

  return updated;
}

export interface QuoteStatusSnapshot {
  quoteId: string;
  summary: string;
  respondedCount: number;
  totalSuppliers: number;
  expiresAt: Date;
}

/**
 * Consulta de andamento (read-only) das cotações ativas de um produtor.
 *
 * Retorna apenas dados agregados — quantos fornecedores foram notificados
 * e quantos já enviaram proposta — sem expor identidades ou valores antes
 * da consolidação. Filtragem rigorosa por tenantId garante isolamento
 * multi-tenant.
 */
export class QuoteStatusService {
  /**
   * Lista cotações ativas (PENDING/COLLECTING) do produtor com contadores
   * de progresso. Ordenado da mais recente para a mais antiga.
   */
  static async getActiveQuotes(
    producerId: string,
    tenantId: string,
  ): Promise<QuoteStatusSnapshot[]> {
    const quotes = await prisma.quote.findMany({
      where: {
        producerId,
        tenantId,
        status: { in: ['PENDING', 'COLLECTING'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { select: { product: true } },
        _count: {
          select: {
            proposals: true,
            supplierNotifications: true,
          },
        },
      },
    });

    return quotes.map((q) => ({
      quoteId: q.id,
      summary: this.buildSummary(q.category, q.items.map((i) => i.product)),
      respondedCount: q._count.proposals,
      totalSuppliers: q._count.supplierNotifications,
      expiresAt: q.expiresAt,
    }));
  }

  /**
   * Resumo curto e anônimo dos itens da cotação para exibir no WhatsApp.
   * Não expõe quantidades nem detalhes técnicos sensíveis.
   */
  private static buildSummary(category: string | null, products: string[]): string {
    if (products.length === 0) {
      return category ? category : 'Cotação';
    }
    if (products.length === 1) {
      return category ? `${category} — ${products[0]}` : products[0];
    }
    if (products.length <= 3) {
      const list = products.join(', ');
      return category ? `${category} — ${list}` : list;
    }
    const head = products.slice(0, 2).join(', ');
    const more = products.length - 2;
    const tail = `+${more} ${more === 1 ? 'item' : 'itens'}`;
    return category ? `${category} — ${head}, ${tail}` : `${head}, ${tail}`;
  }
}
