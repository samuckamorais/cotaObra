import cron from 'node-cron';
import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { logger } from '../utils/logger';
import { JobLockService } from '../services/job-lock.service';

const BATCH_SIZE = 500;

/**
 * Job periódico (cron) para marcar cotações expiradas.
 *
 * Processa em batches de 500 para evitar travamento com volume alto.
 * Para cada cotação expirada:
 *   1. Adquire lock Redis (evita race condition com consolidate)
 *   2. Marca como EXPIRED
 *   3. Notifica o produtor via WhatsApp
 *   4. Reseta ConversationState para IDLE (libera para nova cotação)
 */
export function startExpireQuotesJob(): void {
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Running expire quotes job');

    try {
      let totalExpired = 0;
      let totalSkipped = 0;
      let batchNumber = 0;

      // Loop de batches até não ter mais candidatos
      while (true) {
        batchNumber++;

        const candidates = await prisma.quote.findMany({
          where: {
            status: 'COLLECTING',
            expiresAt: { lt: new Date() },
          },
          select: {
            id: true,
            product: true,
            producerId: true,
            producer: {
              select: { phone: true, name: true },
            },
          },
          take: BATCH_SIZE,
        });

        if (candidates.length === 0) break;

        let batchExpired = 0;
        let batchSkipped = 0;

        for (const quote of candidates) {
          const locked = await JobLockService.acquire(quote.id, 'expire');

          if (!locked) {
            batchSkipped++;
            continue;
          }

          try {
            const result = await prisma.quote.updateMany({
              where: { id: quote.id, status: 'COLLECTING' },
              data: { status: 'EXPIRED', processedBy: 'expire' },
            });

            if (result.count > 0) {
              batchExpired++;

              // Notificar produtor via WhatsApp
              const productName = quote.product || 'cotação';
              try {
                await whatsappService.sendMessage({
                  to: quote.producer.phone,
                  body: `⏰ Sua cotação de *${productName}* expirou sem receber propostas.\n\nO prazo para recebimento de propostas encerrou. Tente novamente com um prazo maior ou outros fornecedores.`,
                });
              } catch (msgErr) {
                logger.warn('Failed to notify producer about expired quote', {
                  quoteId: quote.id, producerId: quote.producerId,
                  error: String(msgErr),
                });
              }

              // Resetar ConversationState do produtor para IDLE
              try {
                await prisma.conversationState.updateMany({
                  where: { producerId: quote.producerId },
                  data: { step: 'IDLE', context: {} },
                });
              } catch (stateErr) {
                logger.warn('Failed to reset producer state after quote expiry', {
                  quoteId: quote.id, producerId: quote.producerId,
                  error: String(stateErr),
                });
              }

              logger.info('Quote expired by job', {
                quoteId: quote.id, producerName: quote.producer.name,
              });
            }
          } finally {
            await JobLockService.release(quote.id, 'expire');
          }
        }

        totalExpired += batchExpired;
        totalSkipped += batchSkipped;

        logger.info('Expire quotes batch completed', {
          batchNumber, batchSize: candidates.length,
          batchExpired, batchSkipped,
        });

        // Se batch retornou menos que BATCH_SIZE, não há mais candidatos
        if (candidates.length < BATCH_SIZE) break;
      }

      if (totalExpired > 0 || totalSkipped > 0) {
        logger.info('Expire quotes job completed', {
          totalExpired, totalSkipped, batchesProcessed: batchNumber,
        });
      }
    } catch (error) {
      logger.error('Error in expire quotes job', { error });
    }
  });

  logger.info('✅ Expire quotes job scheduled (every 10 minutes)');
}

/**
 * Exportado para testes — processa um batch individual.
 */
export { BATCH_SIZE };
