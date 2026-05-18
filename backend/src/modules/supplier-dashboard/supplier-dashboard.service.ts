import { prisma } from '../../config/database';

export interface SupplierMetrics {
  totalParticipations: number;
  wins: number;
  winRate: number;
  avgPosition: number;
  avgTicket: number;
  recentProposals: Array<{
    quoteId: string;
    product: string;
    price: number;
    position: number;
    won: boolean;
    createdAt: Date;
  }>;
}

export class SupplierDashboardService {
  /**
   * Retorna métricas consolidadas para um fornecedor:
   * total de participações, taxa de vitória, posição média, ticket médio
   */
  static async getMetrics(supplierId: string): Promise<SupplierMetrics> {
    const proposals = await prisma.proposal.findMany({
      where: { supplierId },
      include: {
        quote: {
          select: {
            id: true,
            status: true,
            closedSupplierId: true,
            items: { select: { product: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalParticipations = proposals.length;
    const wins = proposals.filter(
      (p) => p.quote.closedSupplierId === supplierId,
    ).length;
    const winRate =
      totalParticipations > 0
        ? parseFloat(((wins / totalParticipations) * 100).toFixed(1))
        : 0;

    // Calcular posição média (baseado no preço relativo aos outros na mesma cotação)
    let totalPosition = 0;
    let positionCount = 0;
    const recentProposals: SupplierMetrics['recentProposals'] = [];

    for (const proposal of proposals.slice(0, 20)) {
      const allProposals = await prisma.proposal.findMany({
        where: { quoteId: proposal.quoteId },
        orderBy: { price: 'asc' },
        select: { id: true, supplierId: true },
      });

      const position =
        allProposals.findIndex((p) => p.supplierId === supplierId) + 1;
      if (position > 0) {
        totalPosition += position;
        positionCount++;
      }

      const product =
        proposal.quote.items.length > 0
          ? proposal.quote.items[0].product
          : 'Produto';

      recentProposals.push({
        quoteId: proposal.quoteId,
        product,
        price: proposal.price,
        position,
        won: proposal.quote.closedSupplierId === supplierId,
        createdAt: proposal.createdAt,
      });
    }

    const avgPosition =
      positionCount > 0
        ? parseFloat((totalPosition / positionCount).toFixed(1))
        : 0;

    const avgTicket =
      totalParticipations > 0
        ? parseFloat(
            (
              proposals.reduce((sum, p) => sum + p.price, 0) /
              totalParticipations
            ).toFixed(2),
          )
        : 0;

    return {
      totalParticipations,
      wins,
      winRate,
      avgPosition,
      avgTicket,
      recentProposals: recentProposals.slice(0, 10),
    };
  }
}
