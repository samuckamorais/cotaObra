import { prisma } from '../../config/database';

interface DateRangeParams {
  from?: string;
  to?: string;
  producerId?: string;
}

export class ReportService {
  /**
   * Resolve o producerId aplicável:
   * - USER com producerId vinculado → sempre restrito ao seu produtor
   * - ADMIN → usa producerId passado como filtro (opcional)
   */
  private static async resolveProducerScope(
    userId: string,
    requestedProducerId?: string
  ): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, producerId: true },
    });
    if (!user) return null;
    if (user.role !== 'ADMIN') return user.producerId || null;
    return requestedProducerId || null;
  }

  private static defaultDateRange(from?: string, to?: string) {
    return {
      gte: from ? new Date(from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      lte: to ? new Date(to) : new Date(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. FUNIL DE COTAÇÃO
  // ─────────────────────────────────────────────────────────────────
  static async getFunnel(tenantId: string, userId: string, params: DateRangeParams) {
    const producerId = await this.resolveProducerScope(userId, params.producerId);
    const createdAt = this.defaultDateRange(params.from, params.to);

    const where: any = { tenantId, createdAt };
    if (producerId) where.producerId = producerId;

    const [total, byStatus, withProposals, closedQuotes] = await Promise.all([
      prisma.quote.count({ where }),

      prisma.quote.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),

      prisma.quote.count({
        where: { ...where, proposals: { some: {} } },
      }),

      // Para cálculo de média de propostas e tempo até primeira proposta
      prisma.quote.findMany({
        where: { ...where, status: 'CLOSED' },
        select: {
          createdAt: true,
          _count: { select: { proposals: true } },
          proposals: {
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s: any) => { statusMap[s.status] = s._count.status; });

    const closed = statusMap['CLOSED'] || 0;
    const summarized = (statusMap['SUMMARIZED'] || 0) + closed;
    const expired = statusMap['EXPIRED'] || 0;

    let avgProposalsPerClosed = 0;
    let avgTimeToFirstProposalHours = 0;

    if (closedQuotes.length > 0) {
      const totalProposals = closedQuotes.reduce((s: number, q: any) => s + q._count.proposals, 0);
      avgProposalsPerClosed = totalProposals / closedQuotes.length;

      const timings = closedQuotes
        .filter((q: any) => q.proposals.length > 0)
        .map((q: any) =>
          (new Date(q.proposals[0].createdAt).getTime() - new Date(q.createdAt).getTime()) / 3600000
        );
      if (timings.length > 0) {
        avgTimeToFirstProposalHours = timings.reduce((s: number, t: number) => s + t, 0) / timings.length;
      }
    }

    return {
      funnel: [
        { stage: 'Criadas', count: total, rate: 100 },
        {
          stage: 'Com propostas',
          count: withProposals,
          rate: total > 0 ? parseFloat(((withProposals / total) * 100).toFixed(1)) : 0,
        },
        {
          stage: 'Consolidadas',
          count: summarized,
          rate: total > 0 ? parseFloat(((summarized / total) * 100).toFixed(1)) : 0,
        },
        {
          stage: 'Fechadas',
          count: closed,
          rate: total > 0 ? parseFloat(((closed / total) * 100).toFixed(1)) : 0,
        },
      ],
      expired,
      byStatus: statusMap,
      avgProposalsPerClosed: parseFloat(avgProposalsPerClosed.toFixed(1)),
      avgTimeToFirstProposalHours: parseFloat(avgTimeToFirstProposalHours.toFixed(1)),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. PAINEL OPERACIONAL
  // ─────────────────────────────────────────────────────────────────
  static async getOperational(tenantId: string, userId: string) {
    const producerId = await this.resolveProducerScope(userId);
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const base: any = { tenantId };
    if (producerId) base.producerId = producerId;

    const [noProposals, expiringSoon, readyToClose] = await Promise.all([
      prisma.quote.findMany({
        where: {
          ...base,
          status: 'COLLECTING',
          createdAt: { lte: ago24h },
          proposals: { none: {} },
        },
        include: {
          producer: { select: { name: true } },
          items: { select: { product: true, quantity: true, unit: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),

      prisma.quote.findMany({
        where: {
          ...base,
          status: 'COLLECTING',
          expiresAt: { gte: now, lte: in48h },
        },
        include: {
          producer: { select: { name: true } },
          items: { select: { product: true, quantity: true, unit: true } },
          _count: { select: { proposals: true } },
        },
        orderBy: { expiresAt: 'asc' },
        take: 50,
      }),

      prisma.quote.findMany({
        where: { ...base, status: 'SUMMARIZED' },
        include: {
          producer: { select: { name: true } },
          items: { select: { product: true, quantity: true, unit: true } },
          _count: { select: { proposals: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      noProposals: noProposals.map((q: any) => ({
        id: q.id,
        producerName: q.producer.name,
        items: q.items,
        category: q.category,
        region: q.region,
        createdAt: q.createdAt,
        hoursOpen: Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 3600000),
      })),
      expiringSoon: expiringSoon.map((q: any) => ({
        id: q.id,
        producerName: q.producer.name,
        items: q.items,
        category: q.category,
        region: q.region,
        expiresAt: q.expiresAt,
        proposalsCount: q._count.proposals,
        hoursLeft: Math.floor((new Date(q.expiresAt).getTime() - now.getTime()) / 3600000),
      })),
      readyToClose: readyToClose.map((q: any) => ({
        id: q.id,
        producerName: q.producer.name,
        items: q.items,
        category: q.category,
        region: q.region,
        proposalsCount: q._count.proposals,
        updatedAt: q.updatedAt,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. ECONOMIA GERADA
  // ─────────────────────────────────────────────────────────────────
  static async getSavings(tenantId: string, userId: string, params: DateRangeParams) {
    const producerId = await this.resolveProducerScope(userId, params.producerId);
    const createdAt = this.defaultDateRange(params.from, params.to);

    const where: any = { tenantId, status: 'CLOSED', createdAt };
    if (producerId) where.producerId = producerId;

    const closedQuotes = await prisma.quote.findMany({
      where,
      include: {
        producer: { select: { name: true } },
        items: { select: { product: true } },
        proposals: {
          select: { totalPrice: true, supplierId: true },
          orderBy: { totalPrice: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalSavings = 0;
    let totalSavingsPercent = 0;
    let countWithSavings = 0;
    const categoryMap: Record<string, { savings: number; count: number }> = {};

    const perQuote = closedQuotes
      .filter((q: any) => q.proposals.length >= 2)
      .map((q: any) => {
        const prices = q.proposals.map((p: any) => p.totalPrice).sort((a: number, b: number) => a - b);
        const winner = prices[0];
        const maxPrice = prices[prices.length - 1];
        const savings = maxPrice - winner;
        const savingsPercent = maxPrice > 0 ? (savings / maxPrice) * 100 : 0;

        totalSavings += savings;
        totalSavingsPercent += savingsPercent;
        countWithSavings++;

        const cat = q.category || 'Sem categoria';
        if (!categoryMap[cat]) categoryMap[cat] = { savings: 0, count: 0 };
        categoryMap[cat].savings += savings;
        categoryMap[cat].count++;

        const products = q.items.length > 0
          ? q.items.map((i: any) => i.product).join(', ')
          : (q.product || '—');

        return {
          quoteId: q.id,
          producerName: q.producer.name,
          category: q.category,
          products,
          winnerPrice: parseFloat(winner.toFixed(2)),
          maxPrice: parseFloat(maxPrice.toFixed(2)),
          savings: parseFloat(savings.toFixed(2)),
          savingsPercent: parseFloat(savingsPercent.toFixed(1)),
          proposalsCount: q.proposals.length,
          createdAt: q.createdAt,
        };
      });

    const byCategory = Object.entries(categoryMap)
      .map(([category, data]) => ({
        category,
        totalSavings: parseFloat(data.savings.toFixed(2)),
        quotesCount: data.count,
        avgSavings: parseFloat((data.count > 0 ? data.savings / data.count : 0).toFixed(2)),
      }))
      .sort((a, b) => b.totalSavings - a.totalSavings);

    return {
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      avgSavingsPercent:
        countWithSavings > 0
          ? parseFloat((totalSavingsPercent / countWithSavings).toFixed(1))
          : 0,
      quotesAnalyzed: countWithSavings,
      totalClosed: closedQuotes.length,
      byCategory,
      perQuote,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. PERFORMANCE DE FORNECEDORES
  // ─────────────────────────────────────────────────────────────────
  static async getSupplierPerformance(tenantId: string, userId: string, params: DateRangeParams) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, producerId: true },
    });

    const createdAt = this.defaultDateRange(params.from, params.to);

    // CO-0-05: fornecedores agora são por tenant. USER vê os mesmos da construtora.
    let supplierWhere: any = { OR: [{ tenantId }, { tenantId: null }] };

    const suppliers = await prisma.supplier.findMany({
      where: supplierWhere,
      select: {
        id: true,
        name: true,
        company: true,
        categories: true,
        isNetworkSupplier: true,
        proposals: {
          where: { tenantId, createdAt },
          select: {
            totalPrice: true,
            deliveryDays: true,
            createdAt: true,
            quote: {
              select: { closedSupplierId: true },
            },
          },
        },
      },
    });

    const result = suppliers
      .map((s: any) => {
        const proposals = s.proposals;
        const totalProposals = proposals.length;
        const wins = proposals.filter((p: any) => p.quote.closedSupplierId === s.id).length;
        const avgTicket =
          totalProposals > 0
            ? proposals.reduce((sum: number, p: any) => sum + p.totalPrice, 0) / totalProposals
            : 0;
        const avgDeliveryDays =
          totalProposals > 0
            ? proposals.reduce((sum: number, p: any) => sum + p.deliveryDays, 0) / totalProposals
            : 0;

        return {
          id: s.id,
          name: s.name,
          company: s.company,
          categories: s.categories,
          isNetworkSupplier: s.isNetworkSupplier,
          totalProposals,
          wins,
          winRate: totalProposals > 0 ? parseFloat(((wins / totalProposals) * 100).toFixed(1)) : 0,
          avgTicket: parseFloat(avgTicket.toFixed(2)),
          avgDeliveryDays: parseFloat(avgDeliveryDays.toFixed(1)),
        };
      })
      .filter((s: any) => s.totalProposals > 0)
      .sort((a: any, b: any) => b.winRate - a.winRate || b.totalProposals - a.totalProposals);

    return { suppliers: result };
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. ANÁLISE POR CATEGORIA E REGIÃO
  // ─────────────────────────────────────────────────────────────────
  static async getCategoryRegion(tenantId: string, userId: string, params: DateRangeParams) {
    const producerId = await this.resolveProducerScope(userId, params.producerId);
    const createdAt = this.defaultDateRange(params.from, params.to);

    const where: any = { tenantId, createdAt };
    if (producerId) where.producerId = producerId;

    const quotes = await prisma.quote.findMany({
      where,
      select: {
        category: true,
        region: true,
        status: true,
        proposals: { select: { totalPrice: true } },
      },
    });

    const categoryMap: Record<
      string,
      { count: number; closed: number; proposalsTotal: number; priceSum: number; priceCount: number }
    > = {};
    const regionMap: Record<string, { count: number; closed: number; noProposals: number }> = {};

    quotes.forEach((q: any) => {
      const cat = q.category || 'Sem categoria';
      if (!categoryMap[cat])
        categoryMap[cat] = { count: 0, closed: 0, proposalsTotal: 0, priceSum: 0, priceCount: 0 };
      categoryMap[cat].count++;
      if (q.status === 'CLOSED') categoryMap[cat].closed++;
      categoryMap[cat].proposalsTotal += q.proposals.length;
      q.proposals.forEach((p: any) => {
        categoryMap[cat].priceSum += p.totalPrice;
        categoryMap[cat].priceCount++;
      });

      const reg = q.region || 'Sem região';
      if (!regionMap[reg]) regionMap[reg] = { count: 0, closed: 0, noProposals: 0 };
      regionMap[reg].count++;
      if (q.status === 'CLOSED') regionMap[reg].closed++;
      if (q.proposals.length === 0) regionMap[reg].noProposals++;
    });

    const byCategory = Object.entries(categoryMap)
      .map(([category, d]) => ({
        category,
        quotesCount: d.count,
        closedCount: d.closed,
        closureRate: d.count > 0 ? parseFloat(((d.closed / d.count) * 100).toFixed(1)) : 0,
        avgProposals: d.count > 0 ? parseFloat((d.proposalsTotal / d.count).toFixed(1)) : 0,
        avgPrice: d.priceCount > 0 ? parseFloat((d.priceSum / d.priceCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.quotesCount - a.quotesCount);

    const byRegion = Object.entries(regionMap)
      .map(([region, d]) => ({
        region,
        quotesCount: d.count,
        closedCount: d.closed,
        closureRate: d.count > 0 ? parseFloat(((d.closed / d.count) * 100).toFixed(1)) : 0,
        noProposals: d.noProposals,
        demandWithoutSupply: d.noProposals > 0,
      }))
      .sort((a, b) => b.quotesCount - a.quotesCount);

    return { byCategory, byRegion };
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. COMPARAÇÃO DE PERÍODOS
  // ─────────────────────────────────────────────────────────────────
  static async comparePeriods(
    tenantId: string,
    userId: string,
    reportType: 'funnel' | 'savings',
    current: { from?: string; to?: string },
    previous: { from?: string; to?: string },
  ) {
    const [currentData, previousData] = await Promise.all([
      reportType === 'funnel'
        ? this.getFunnel(tenantId, userId, current)
        : this.getSavings(tenantId, userId, current),
      reportType === 'funnel'
        ? this.getFunnel(tenantId, userId, previous)
        : this.getSavings(tenantId, userId, previous),
    ]);

    return { current: currentData, previous: previousData };
  }
}
