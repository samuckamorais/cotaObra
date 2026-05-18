import cron from 'node-cron';
import { logger } from '../utils/logger';
import { EmailDripService } from '../services/email-drip.service';

/**
 * Job diário para envio de emails da sequência drip.
 * Roda às 09:00 todos os dias.
 */
export function startEmailDripJob(): void {
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running email drip job');

    try {
      const result = await EmailDripService.processDaily();

      if (result.sent > 0 || result.skipped > 0) {
        logger.info('Email drip job completed', {
          sent: result.sent,
          skipped: result.skipped,
        });
      }
    } catch (error) {
      logger.error('Error in email drip job', { error });
    }
  });

  logger.info('✅ Email drip job scheduled (daily at 09:00)');
}
