import cron from 'node-cron';
import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { logger } from '../utils/logger';

/**
 * Job diário para coletar ratings de produtores sobre fornecedores.
 * Roda às 10:00 todos os dias.
 * Envia WhatsApp para produtores cujas cotações foram fechadas há 7 dias.
 */
export function startCollectRatingsJob(): void {
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running collect ratings job');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Início e fim do dia 7 dias atrás
      const dayStart = new Date(sevenDaysAgo);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(sevenDaysAgo);
      dayEnd.setHours(23, 59, 59, 999);

      // Buscar cotações fechadas há 7 dias que têm fornecedor vencedor
      const quotes = await prisma.quote.findMany({
        where: {
          status: 'CLOSED',
          closedSupplierId: { not: null },
          updatedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          producer: {
            select: { id: true, phone: true, name: true },
          },
        },
      });

      let sent = 0;

      for (const quote of quotes) {
        if (!quote.closedSupplierId) continue;

        // Buscar nome do fornecedor vencedor
        const supplier = await prisma.supplier.findUnique({
          where: { id: quote.closedSupplierId },
          select: { name: true },
        });

        if (!supplier) continue;

        try {
          // Enviar mensagem de rating via WhatsApp
          await whatsappService.sendMessage({
            to: quote.producer.phone,
            body: `⭐ Como foi a entrega de *${supplier.name}*? De 1 a 5 estrelas, qual nota você dá?\n\nResponda com um número de 1 a 5.`,
          });

          // Atualizar estado da conversa do produtor para AWAITING_RATING
          await prisma.conversationState.upsert({
            where: { producerId: quote.producer.id },
            create: {
              producerId: quote.producer.id,
              tenantId: quote.tenantId,
              step: 'AWAITING_RATING',
              context: {
                quoteId: quote.id,
                supplierId: quote.closedSupplierId,
              },
            },
            update: {
              step: 'AWAITING_RATING',
              context: {
                quoteId: quote.id,
                supplierId: quote.closedSupplierId,
              },
            },
          });

          sent++;
        } catch (error) {
          logger.warn('Failed to send rating request', {
            quoteId: quote.id,
            producerId: quote.producer.id,
            error: String(error),
          });
        }
      }

      if (sent > 0) {
        logger.info('Collect ratings job completed', { sent, total: quotes.length });
      }
    } catch (error) {
      logger.error('Error in collect ratings job', { error });
    }
  });

  logger.info('✅ Collect ratings job scheduled (daily at 10:00)');
}
