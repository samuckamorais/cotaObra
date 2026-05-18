import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Job mensal para resetar quotas de cotações.
 * Executa no dia 1 de cada mês às 01:00.
 * Reseta quotesUsed para 0 em todas as assinaturas ativas.
 */
export function startResetQuotasJob(): void {
  cron.schedule('0 1 1 * *', async () => {
    logger.info('Running monthly quota reset job');

    try {
      const result = await prisma.subscription.updateMany({
        where: { active: true },
        data: { quotesUsed: 0 },
      });

      logger.info('Monthly quota reset completed', { subscriptionsReset: result.count });
    } catch (error) {
      logger.error('Error in monthly quota reset job', { error });
    }
  });

  logger.info('✅ Monthly quota reset job scheduled (1st of each month at 01:00)');
}
