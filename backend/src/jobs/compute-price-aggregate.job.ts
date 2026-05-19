import cron from 'node-cron';
import { logger } from '../utils/logger';
import { PriceHistoryAggregateService } from '../services/price-history-aggregate.service';

/**
 * CO-6-06 — Job noturno que recomputa PriceHistoryAggregate (mês corrente + anterior).
 * Roda diariamente às 00:30. Idempotente (upsert por tenant/material/region/period).
 */
export function startPriceHistoryAggregateJob(): void {
  cron.schedule('30 0 * * *', async () => {
    logger.info('price_aggregate.cron_tick');
    try {
      const result = await PriceHistoryAggregateService.runDaily();
      logger.info('price_aggregate.cron_done', result);
    } catch (err: any) {
      logger.error('price_aggregate.cron_failed', { err: err?.message });
    }
  });

  logger.info('✅ PriceHistoryAggregate cron scheduled (daily at 00:30)');
}
