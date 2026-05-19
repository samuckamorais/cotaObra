import { prisma } from '../config/database';
import { createError } from '../utils/error-handler';
import type { AuthContext } from '../utils/auth-context';

/**
 * CO-4-03 — payload do quadro comparativo.
 *
 * Estrutura otimizada para o componente PricingComparator (CO-4-04)
 * renderizar tabela item × fornecedor sem fazer aggregation no cliente.
 */

export interface ComparativeItem {
  id: string;
  description: string;
  qty: number | null;
  unit: string | null;
  materialName: string | null;
}

export interface ComparativeProposalItem {
  quoteItemId: string;
  unitPrice: number;
  totalPrice: number;
  available: boolean;
  /** Rank desse fornecedor para esse item específico (1 = menor unitPrice) */
  rank: number;
}

export interface ComparativeProposal {
  supplierId: string;
  supplierName: string;
  supplierCompany: string | null;
  rank: number | null;
  totalValue: number;
  correctedTotal: number | null;
  breakdown: any | null;
  freightMode: string | null;
  freightValue: number | null;
  paymentTerms: string;
  deliveryDays: number;
  isPartial: boolean;
  items: ComparativeProposalItem[];
}

export interface ComparativePayload {
  quote: {
    id: string;
    status: string;
    deadlineDays: number;
    siteName: string | null;
    items: ComparativeItem[];
  };
  proposals: ComparativeProposal[];
  summary: {
    lowestCorrectedTotal: number | null;
    highestCorrectedTotal: number | null;
    savings: number | null;
    winnerSupplierId: string | null;
    /** REQUESTER recebe payload limitado sem preços absolutos. */
    redacted: boolean;
  };
}

export class ComparativeService {
  static async getForQuote(ctx: AuthContext, quoteId: string): Promise<ComparativePayload> {
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        ...(ctx.role !== 'SUPER_ADMIN' && { tenantId: ctx.tenantId }),
      },
      include: {
        site: { select: { name: true } },
        items: true,
        proposals: {
          include: {
            supplier: { select: { id: true, name: true, company: true } },
            items: true,
          },
          orderBy: [{ rank: 'asc' }, { totalPrice: 'asc' }],
        },
      },
    });

    if (!quote) throw createError.notFound('Cotação não encontrada');

    // dias de prazo: createdAt → deadline
    const deadlineDays = Math.max(
      0,
      Math.round(
        (quote.deadline.getTime() - quote.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    // Para cada quoteItem, calcula rank por unitPrice (menor = 1).
    const itemRanks: Record<string, Map<string, number>> = {};
    for (const item of quote.items) {
      const pricesByProposal: Array<{ proposalId: string; unitPrice: number }> = [];
      for (const prop of quote.proposals) {
        const propItem = prop.items.find((pi: any) => pi.quoteItemId === item.id);
        if (propItem && propItem.available !== false && propItem.unitPrice > 0) {
          pricesByProposal.push({
            proposalId: prop.id,
            unitPrice: propItem.unitPrice,
          });
        }
      }
      pricesByProposal.sort((a, b) => a.unitPrice - b.unitPrice);
      itemRanks[item.id] = new Map(
        pricesByProposal.map((p, idx) => [p.proposalId, idx + 1]),
      );
    }

    const proposals: ComparativeProposal[] = quote.proposals.map((p) => {
      const propItems: ComparativeProposalItem[] = quote.items.map((qi) => {
        const pi = p.items.find((x: any) => x.quoteItemId === qi.id);
        return {
          quoteItemId: qi.id,
          unitPrice: pi?.unitPrice ?? 0,
          totalPrice: pi?.totalPrice ?? 0,
          available: pi?.available ?? false,
          rank: itemRanks[qi.id]?.get(p.id) ?? 0,
        };
      });

      return {
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        supplierCompany: p.supplier.company,
        rank: p.rank,
        totalValue: p.totalPrice,
        correctedTotal: p.correctedTotal !== null ? Number(p.correctedTotal) : null,
        breakdown: p.breakdown,
        freightMode: p.freightMode,
        freightValue: p.freightValue ?? null,
        paymentTerms: p.paymentTerms,
        deliveryDays: p.deliveryDays,
        isPartial: p.isPartial,
        items: propItems,
      };
    });

    // Summary: encontra winner (rank=1) + savings
    const withCorrected = proposals.filter((p) => p.correctedTotal !== null);
    let lowestCorrectedTotal: number | null = null;
    let highestCorrectedTotal: number | null = null;
    let winnerSupplierId: string | null = null;
    if (withCorrected.length > 0) {
      const sorted = [...withCorrected].sort(
        (a, b) => (a.correctedTotal as number) - (b.correctedTotal as number),
      );
      lowestCorrectedTotal = sorted[0].correctedTotal;
      highestCorrectedTotal = sorted[sorted.length - 1].correctedTotal;
      winnerSupplierId = proposals.find((p) => p.rank === 1)?.supplierId ?? sorted[0].supplierId;
    }

    const savings =
      lowestCorrectedTotal !== null && highestCorrectedTotal !== null
        ? highestCorrectedTotal - lowestCorrectedTotal
        : null;

    // CO-4-03 RBAC: REQUESTER vê apenas resumo sem preços absolutos
    const redacted = ctx.role === 'REQUESTER';
    if (redacted) {
      proposals.forEach((p) => {
        p.totalValue = 0;
        p.correctedTotal = null;
        p.breakdown = null;
        p.freightValue = null;
        p.items.forEach((i) => {
          i.unitPrice = 0;
          i.totalPrice = 0;
        });
      });
    }

    return {
      quote: {
        id: quote.id,
        status: quote.status,
        deadlineDays,
        siteName: quote.site?.name ?? null,
        items: quote.items.map((it) => ({
          id: it.id,
          description: it.product,
          qty: typeof it.quantity === 'string' ? parseFloat(it.quantity) : (it.quantity as any),
          unit: it.unit,
          materialName: null, // CO-1+ futuramente: it.materialId → Material.name
        })),
      },
      proposals,
      summary: {
        lowestCorrectedTotal: redacted ? null : lowestCorrectedTotal,
        highestCorrectedTotal: redacted ? null : highestCorrectedTotal,
        savings: redacted ? null : savings,
        winnerSupplierId,
        redacted,
      },
    };
  }
}
