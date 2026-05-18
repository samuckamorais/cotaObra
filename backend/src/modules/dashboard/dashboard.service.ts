import { prisma } from '../../config/database';
import { DashboardStats, QuotesByDay, TopProduct } from '../../types';
import { env } from '../../config/env';

export class DashboardService {
  /**
   * KPIs principais do dashboard
   */
  static async getStats(tenantId: string): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const [quotesToday, proposalsReceived, closedQuotes, totalQuotes, activeProducers] =
      await Promise.all([
        // Cotações criadas hoje
        prisma.quote.count({
          where: {
            tenantId,
            createdAt: {
              gte: todayStart,
            },
          },
        }),

        // Propostas recebidas (total)
        prisma.proposal.count({ where: { tenantId } }),

        // Cotações fechadas
        prisma.quote.count({
          where: { tenantId, status: 'CLOSED' },
        }),

        // Total de cotações
        prisma.quote.count({ where: { tenantId } }),

        // Produtores com assinatura ativa
        prisma.producer.count({
          where: {
            tenantId,
            subscription: {
              active: true,
            },
          },
        }),
      ]);

    // Taxa de fechamento
    const closureRate = totalQuotes > 0 ? (closedQuotes / totalQuotes) * 100 : 0;

    return {
      quotesToday,
      proposalsReceived,
      closureRate: parseFloat(closureRate.toFixed(2)),
      activeProducers,
    };
  }

  /**
   * Gráfico de cotações por dia (últimos 30 dias)
   */
  static async getQuotesByDay(tenantId: string, days = 30): Promise<QuotesByDay[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const quotes = await prisma.quote.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Agrupar por dia
    const groupedByDay = quotes.reduce((acc: Record<string, number>, quote: any) => {
      const date = quote.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Converter para array ordenado
    const result: QuotesByDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: groupedByDay[dateStr] || 0,
      });
    }

    return result;
  }

  /**
   * Top 5 produtos mais cotados
   */
  static async getTopProducts(tenantId: string, limit = 5): Promise<TopProduct[]> {
    const quotes = await prisma.quote.groupBy({
      by: ['product'],
      where: { tenantId },
      _count: {
        product: true,
      },
      orderBy: {
        _count: {
          product: 'desc',
        },
      },
      take: limit,
    });

    return quotes.map((q: any) => ({
      product: q.product,
      count: q._count.product,
    }));
  }

  /**
   * Últimas cotações (10 mais recentes)
   */
  static async getRecentQuotes(tenantId: string, limit = 10) {
    return await prisma.quote.findMany({
      where: { tenantId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        producer: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            proposals: true,
          },
        },
      },
    });
  }

  /**
   * Estatísticas de fornecedores
   */
  static async getSupplierStats(tenantId: string) {
    const [totalSuppliers, networkSuppliers, producerSuppliers, topSuppliersByProposals] =
      await Promise.all([
        // Total de fornecedores (do tenant; + rede apenas se feature habilitada)
        prisma.supplier.count({
          where: env.ENABLE_NETWORK_SUPPLIERS
            ? { OR: [{ tenantId }, { tenantId: null }] }
            : { tenantId },
        }),

        // Fornecedores da rede — retorna 0 quando feature desabilitada
        env.ENABLE_NETWORK_SUPPLIERS
          ? prisma.supplier.count({ where: { tenantId: null, isNetworkSupplier: true } })
          : Promise.resolve(0),

        // Fornecedores do tenant
        prisma.supplier.count({
          where: { tenantId, isNetworkSupplier: false },
        }),

        // Top fornecedores por propostas enviadas
        prisma.supplier.findMany({
          where: env.ENABLE_NETWORK_SUPPLIERS
            ? { OR: [{ tenantId }, { tenantId: null }] }
            : { tenantId },
          take: 5,
          select: {
            id: true,
            name: true,
            _count: { select: { proposals: true } },
          },
          orderBy: { proposals: { _count: 'desc' } },
        }),
      ]);

    return {
      totalSuppliers,
      // networkSuppliers = 0 quando ENABLE_NETWORK_SUPPLIERS=false
      networkSuppliers,
      producerSuppliers,
      topSuppliers: topSuppliersByProposals.map((s: any) => ({
        name: s.name,
        proposalsCount: s._count.proposals,
      })),
    };
  }

  /**
   * Estatísticas de produtores
   */
  static async getProducerStats(tenantId: string) {
    const [
      totalProducers,
      producersWithQuotes,
      producersWithActiveSubscription,
      topProducersByQuotes,
    ] = await Promise.all([
      // Total de produtores
      prisma.producer.count({ where: { tenantId } }),

      // Produtores que já fizeram cotações
      prisma.producer.count({
        where: {
          tenantId,
          quotes: {
            some: {},
          },
        },
      }),

      // Produtores com assinatura ativa
      prisma.producer.count({
        where: {
          tenantId,
          subscription: {
            active: true,
          },
        },
      }),

      // Top produtores por cotações
      prisma.producer.findMany({
        where: { tenantId },
        take: 5,
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              quotes: true,
            },
          },
        },
        orderBy: {
          quotes: {
            _count: 'desc',
          },
        },
      }),
    ]);

    return {
      totalProducers,
      producersWithQuotes,
      producersWithActiveSubscription,
      topProducers: topProducersByQuotes.map((p: any) => ({
        name: p.name,
        quotesCount: p._count.quotes,
      })),
    };
  }

  /**
   * Estatísticas por categoria de fornecedor
   */
  static async getStatsByCategory(tenantId: string) {
    const suppliers = await prisma.supplier.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      select: {
        categories: true,
        _count: {
          select: {
            proposals: true,
          },
        },
      },
    });

    // Agrupar por categoria
    const categoryStats: Record<string, { suppliers: number; proposals: number }> = {};

    suppliers.forEach((supplier: any) => {
      supplier.categories.forEach((category: string) => {
        if (!categoryStats[category]) {
          categoryStats[category] = { suppliers: 0, proposals: 0 };
        }
        categoryStats[category].suppliers += 1;
        categoryStats[category].proposals += supplier._count.proposals;
      });
    });

    return Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      suppliersCount: stats.suppliers,
      proposalsCount: stats.proposals,
    }));
  }

  /**
   * Estatísticas de propostas e valores
   */
  static async getProposalStats(tenantId: string) {
    const proposals = await prisma.proposal.findMany({
      where: { tenantId },
      select: {
        totalPrice: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthProposals = proposals.filter((p: any) => p.createdAt >= thisMonthStart);
    const lastMonthProposals = proposals.filter(
      (p: any) => p.createdAt >= lastMonthStart && p.createdAt < thisMonthStart
    );

    const totalVolume = proposals.reduce((sum: number, p: any) => sum + p.totalPrice, 0);
    const thisMonthVolume = thisMonthProposals.reduce((sum: number, p: any) => sum + p.totalPrice, 0);
    const lastMonthVolume = lastMonthProposals.reduce((sum: number, p: any) => sum + p.totalPrice, 0);

    const avgProposalValue = proposals.length > 0 ? totalVolume / proposals.length : 0;

    return {
      totalProposals: proposals.length,
      totalVolume,
      avgProposalValue,
      thisMonth: {
        count: thisMonthProposals.length,
        volume: thisMonthVolume,
      },
      lastMonth: {
        count: lastMonthProposals.length,
        volume: lastMonthVolume,
      },
    };
  }

  /**
   * Status de cotações
   */
  static async getQuoteStatusStats(tenantId: string) {
    const statusCounts = await prisma.quote.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: {
        status: true,
      },
    });

    return statusCounts.map((s: any) => ({
      status: s.status,
      count: s._count.status,
    }));
  }

  /**
   * Dashboard completo (combina todos os dados)
   */
  static async getDashboardData(tenantId: string) {
    const [
      stats,
      quotesByDay,
      topProducts,
      recentQuotes,
      supplierStats,
      producerStats,
      categoryStats,
      proposalStats,
      quoteStatusStats,
    ] = await Promise.all([
      this.getStats(tenantId),
      this.getQuotesByDay(tenantId, 30),
      this.getTopProducts(tenantId, 5),
      this.getRecentQuotes(tenantId, 10),
      this.getSupplierStats(tenantId),
      this.getProducerStats(tenantId),
      this.getStatsByCategory(tenantId),
      this.getProposalStats(tenantId),
      this.getQuoteStatusStats(tenantId),
    ]);

    return {
      stats,
      charts: {
        quotesByDay,
        topProducts,
        categoryStats,
        quoteStatusStats,
      },
      supplierStats,
      producerStats,
      proposalStats,
      recentQuotes,
    };
  }
}
