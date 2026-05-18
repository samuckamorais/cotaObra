import { prisma } from '../config/database';

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
