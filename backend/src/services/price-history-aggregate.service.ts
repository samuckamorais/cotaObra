import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * CO-6-06 — Agrega PriceHistoryRaw em buckets (tenant, material/description, region, period=YYYY-MM).
 *
 * Roda como cron noturno (00:30) — recomputa o mês atual + mês anterior
 * (idempotente via upsert na unique constraint).
 *
 * Exposto via GET /api/reports/price-history (CO-6-07).
 */

const { Decimal } = Prisma;

interface AggregateKey {
  tenantId: string;
  materialId: string | null;
  description: string;
  region: string;
  period: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function toPeriod(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function startOfPeriod(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
}
function startOfNextPeriod(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1, 0, 0, 0));
}

export class PriceHistoryAggregateService {
  /**
   * Recomputa agregados para um período (YYYY-MM). Idempotente.
   */
  static async computePeriod(period: string): Promise<{ rows: number }> {
    const from = startOfPeriod(period);
    const to = startOfNextPeriod(period);

    logger.info('price_aggregate.compute_start', { period, from, to });

    const rows = await prisma.priceHistoryRaw.findMany({
      where: { observedAt: { gte: from, lt: to } },
      select: {
        tenantId: true,
        materialId: true,
        description: true,
        region: true,
        unitPrice: true,
        paymentTerms: true,
      },
    });

    // Agrupa por (tenantId, materialId|description, region)
    const buckets = new Map<
      string,
      {
        key: AggregateKey;
        prices: number[];
        payments: Record<string, number>;
      }
    >();

    for (const r of rows) {
      const k: AggregateKey = {
        tenantId: r.tenantId,
        materialId: r.materialId,
        description: r.description.trim().toLowerCase(),
        region: r.region,
        period,
      };
      const id = `${k.tenantId}::${k.materialId ?? 'null'}::${k.description}::${k.region}`;
      const b = buckets.get(id) ?? {
        key: { ...k, description: r.description.trim() },
        prices: [],
        payments: {},
      };
      b.prices.push(Number(r.unitPrice));
      if (r.paymentTerms) {
        b.payments[r.paymentTerms] = (b.payments[r.paymentTerms] ?? 0) + 1;
      }
      buckets.set(id, b);
    }

    let written = 0;
    for (const { key, prices, payments } of buckets.values()) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      const med = median(prices);

      // Postgres trata NULL como distinto em UNIQUE, então usamos findFirst + update/create
      // em vez de upsert (que exige all-non-null composite key).
      const existing = await prisma.priceHistoryAggregate.findFirst({
        where: {
          tenantId: key.tenantId,
          materialId: key.materialId,
          description: key.description,
          region: key.region,
          period: key.period,
        },
        select: { id: true },
      });

      const data = {
        minPrice: new Decimal(min.toFixed(2)),
        maxPrice: new Decimal(max.toFixed(2)),
        avgPrice: new Decimal(avg.toFixed(2)),
        medianPrice: new Decimal(med.toFixed(2)),
        samples: prices.length,
        paymentTermsBreakdown: payments,
      };

      if (existing) {
        await prisma.priceHistoryAggregate.update({
          where: { id: existing.id },
          data: { ...data, computedAt: new Date() },
        });
      } else {
        await prisma.priceHistoryAggregate.create({
          data: {
            tenantId: key.tenantId,
            materialId: key.materialId,
            description: key.description,
            region: key.region,
            period: key.period,
            ...data,
          },
        });
      }
      written++;
    }

    logger.info('price_aggregate.compute_done', { period, rows: written });
    return { rows: written };
  }

  /**
   * Recompute do mês corrente + mês anterior. Chamado pelo cron noturno.
   */
  static async runDaily(): Promise<{ current: number; previous: number }> {
    const now = new Date();
    const currentPeriod = toPeriod(now);

    // Mês anterior
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousPeriod = toPeriod(prev);

    const [a, b] = await Promise.all([
      this.computePeriod(currentPeriod),
      this.computePeriod(previousPeriod),
    ]);
    return { current: a.rows, previous: b.rows };
  }

  /**
   * Lookup: agregações para uma query (filtros).
   */
  static async query(
    tenantId: string,
    filters: {
      materialId?: string;
      description?: string;
      region?: string;
      fromPeriod?: string; // inclusive
      toPeriod?: string; // inclusive
    },
  ) {
    const where: Prisma.PriceHistoryAggregateWhereInput = { tenantId };
    if (filters.materialId) where.materialId = filters.materialId;
    if (filters.description)
      where.description = { contains: filters.description, mode: 'insensitive' };
    if (filters.region) where.region = filters.region;
    if (filters.fromPeriod || filters.toPeriod) {
      where.period = {};
      if (filters.fromPeriod) where.period.gte = filters.fromPeriod;
      if (filters.toPeriod) where.period.lte = filters.toPeriod;
    }
    return prisma.priceHistoryAggregate.findMany({
      where,
      orderBy: [{ period: 'asc' }, { description: 'asc' }],
      take: 500,
    });
  }
}
