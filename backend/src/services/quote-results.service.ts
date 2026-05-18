import { prisma } from '../config/database';
import { createError } from '../utils/error-handler';
import { enqueueQuotePdfJob } from '../jobs/generate-quote-pdf.job';
import { logger } from '../utils/logger';

export interface SupplierTotalResult {
  supplierId: string;
  supplierName: string;
  totalPrice: number;
  itemsCovered: number;
  itemsTotal: number;
  isPartial: boolean;
  paymentTerms: string;
  deliveryDays: number;
  observations?: string;
  proposalId: string;
}

export interface ItemWinner {
  quoteItemId: string;
  product: string;
  quantity: number;
  unit: string;
  winner: {
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    totalPrice: number;
    proposalId: string;
  } | null;
  allOffers: Array<{
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    totalPrice: number;
    proposalId: string;
  }>;
}

export interface QuoteResultsData {
  quoteId: string;
  status: string;
  category: string | null;
  region: string;
  deadline: Date;
  freight: string | null;
  producerName: string;
  items: Array<{ id: string; product: string; quantity: number; unit: string }>;
  // Modo 1: vencedor por preço total (apenas propostas completas)
  totalPriceRanking: SupplierTotalResult[];
  // Modo 2: vencedores por item
  itemWinners: ItemWinner[];
  // Propostas parciais (excluídas do ranking total)
  partialProposals: SupplierTotalResult[];
  closedSupplierId: string | null;
}

export class QuoteResultsService {
  static async getResults(tenantId: string, quoteId: string): Promise<QuoteResultsData> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        producer: { select: { name: true } },
        items: { orderBy: { product: 'asc' } },
        proposals: {
          include: {
            supplier: { select: { id: true, name: true } },
            items: true,
          },
          orderBy: { totalPrice: 'asc' },
        },
      },
    });

    if (!quote) throw createError.notFound('Cotação não encontrada');

    const itemsTotal = quote.items.length;

    // Construir ranking por preço total
    const allRanking: SupplierTotalResult[] = quote.proposals.map((p) => ({
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      totalPrice: p.totalPrice,
      itemsCovered: p.items.length || (itemsTotal > 0 ? itemsTotal : 1), // legado sem ProposalItems
      itemsTotal,
      isPartial: p.isPartial,
      paymentTerms: p.paymentTerms,
      deliveryDays: p.deliveryDays,
      observations: p.observations || undefined,
      proposalId: p.id,
    }));

    const totalPriceRanking = allRanking
      .filter((r) => !r.isPartial)
      .sort((a, b) => a.totalPrice - b.totalPrice);

    const partialProposals = allRanking
      .filter((r) => r.isPartial)
      .sort((a, b) => a.totalPrice - b.totalPrice);

    // Construir vencedores por item
    const itemWinners: ItemWinner[] = quote.items.map((qItem) => {
      const offers = quote.proposals
        .flatMap((p) =>
          p.items
            .filter((pi) => pi.quoteItemId === qItem.id)
            .map((pi) => ({
              supplierId: p.supplierId,
              supplierName: p.supplier.name,
              unitPrice: pi.unitPrice,
              totalPrice: pi.totalPrice,
              proposalId: p.id,
            }))
        )
        .sort((a, b) => a.unitPrice - b.unitPrice);

      return {
        quoteItemId: qItem.id,
        product: qItem.product,
        quantity: qItem.quantity,
        unit: qItem.unit,
        winner: offers.length > 0 ? offers[0] : null,
        allOffers: offers,
      };
    });

    return {
      quoteId: quote.id,
      status: quote.status,
      category: quote.category,
      region: quote.region,
      deadline: quote.deadline,
      freight: quote.freight,
      producerName: quote.producer.name,
      items: quote.items.map((it) => ({
        id: it.id,
        product: it.product,
        quantity: it.quantity,
        unit: it.unit,
      })),
      totalPriceRanking,
      itemWinners,
      partialProposals,
      closedSupplierId: quote.closedSupplierId,
    };
  }

  /**
   * Fecha cotação com vencedor único (modo preço total)
   */
  static async closeWithTotalWinner(tenantId: string, quoteId: string, supplierId: string): Promise<void> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: { producer: { select: { id: true, phone: true } } },
    });
    if (!quote) throw createError.notFound('Cotação não encontrada');
    if (quote.status === 'CLOSED') throw createError.conflict('Cotação já foi fechada');

    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'CLOSED', closedSupplierId: supplierId },
    });

    // FEAT-PDF-001 — Enfileira PDF de resultado (idempotente, async, AC-06).
    enqueueQuotePdfJob({
      quoteId,
      tenantId,
      producerId: quote.producer.id,
      producerPhone: quote.producer.phone,
    }).catch((err) =>
      logger.error('PDF enqueue failed', {
        quoteId,
        error: (err as Error).message,
      }),
    );
  }

  /**
   * Fecha cotação com vencedores por item (modo por item)
   * Atualiza winningSupplierId em cada QuoteItem
   */
  static async closeWithItemWinners(
    tenantId: string,
    quoteId: string,
    winners: Array<{ quoteItemId: string; supplierId: string }>
  ): Promise<void> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: { producer: { select: { id: true, phone: true } } },
    });
    if (!quote) throw createError.notFound('Cotação não encontrada');
    if (quote.status === 'CLOSED') throw createError.conflict('Cotação já foi fechada');

    await prisma.$transaction([
      ...winners.map((w) =>
        prisma.quoteItem.update({
          where: { id: w.quoteItemId },
          data: { winningSupplierId: w.supplierId },
        })
      ),
      prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'CLOSED' },
      }),
    ]);

    // FEAT-PDF-001 — Enfileira PDF de resultado (mesmo job, modo por item).
    enqueueQuotePdfJob({
      quoteId,
      tenantId,
      producerId: quote.producer.id,
      producerPhone: quote.producer.phone,
    }).catch((err) =>
      logger.error('PDF enqueue failed', {
        quoteId,
        error: (err as Error).message,
      }),
    );
  }
}
