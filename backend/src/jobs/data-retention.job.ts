import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Job mensal de retenção de dados (LGPD).
 *
 * Executa no 1o dia de cada mês às 03:00:
 *   - Deleta cotações com mais de 2 anos
 *   - Deleta propostas com mais de 1 ano
 *   - Deleta conversation_metrics com mais de 1 ano
 *   - Deleta logs (whatsapp_config_logs) com mais de 6 meses
 */
export function startDataRetentionJob(): void {
  // Executa no dia 1 de cada mês às 03:00
  cron.schedule('0 3 1 * *', async () => {
    logger.info('Running data retention job (LGPD)');

    try {
      const now = new Date();

      // 1. Cotações com mais de 2 anos
      const twoYearsAgo = new Date(now);
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const deletedQuotes = await prisma.quote.deleteMany({
        where: {
          createdAt: { lt: twoYearsAgo },
          status: { in: ['CLOSED', 'EXPIRED'] },
        },
      });

      logger.info('Data retention: old quotes deleted', {
        count: deletedQuotes.count,
        olderThan: twoYearsAgo.toISOString(),
      });

      // 2. Propostas com mais de 1 ano
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const deletedProposals = await prisma.proposal.deleteMany({
        where: {
          createdAt: { lt: oneYearAgo },
        },
      });

      logger.info('Data retention: old proposals deleted', {
        count: deletedProposals.count,
        olderThan: oneYearAgo.toISOString(),
      });

      // 3. Conversation metrics com mais de 1 ano
      const deletedMetrics = await prisma.conversationMetric.deleteMany({
        where: {
          timestamp: { lt: oneYearAgo },
        },
      });

      logger.info('Data retention: old conversation metrics deleted', {
        count: deletedMetrics.count,
        olderThan: oneYearAgo.toISOString(),
      });

      // 4. WhatsApp config logs com mais de 6 meses
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const deletedLogs = await prisma.whatsAppConfigLog.deleteMany({
        where: {
          createdAt: { lt: sixMonthsAgo },
        },
      });

      logger.info('Data retention: old whatsapp config logs deleted', {
        count: deletedLogs.count,
        olderThan: sixMonthsAgo.toISOString(),
      });

      logger.info('Data retention job completed', {
        deletedQuotes: deletedQuotes.count,
        deletedProposals: deletedProposals.count,
        deletedMetrics: deletedMetrics.count,
        deletedLogs: deletedLogs.count,
      });
    } catch (error) {
      logger.error('Error in data retention job', { error });
    }
  });

  logger.info('Data retention job scheduled (monthly, 1st day at 03:00)');
}
