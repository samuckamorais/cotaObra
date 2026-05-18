import cron from 'node-cron';
import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { patternDetectionService } from '../services/pattern-detection.service';
import { logger } from '../utils/logger';

/**
 * Job que roda diariamente para enviar sugestões proativas de cotação
 * Analisa padrões de produtores e notifica quando detectar momento adequado
 */
export class ProactiveQuotesJob {
  /**
   * Executa o job de sugestões proativas
   */
  async execute(): Promise<void> {
    logger.info('Starting proactive quotes job');

    try {
      // Buscar todos os produtores ativos
      const producers = await prisma.producer.findMany({
        where: {
          // Apenas produtores que têm pelo menos 3 cotações
          quotes: {
            some: {},
          },
        },
        include: {
          quotes: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      let suggestions = 0;

      for (const producer of producers) {
        try {
          // Verificar se já recebeu sugestão hoje
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const suggestionToday = await prisma.conversationState.findFirst({
            where: {
              producerId: producer.id,
              updatedAt: {
                gte: today,
              },
              step: 'AWAITING_PROACTIVE_CHOICE', // novo estado
            },
          });

          // Não enviar se já enviou hoje
          if (suggestionToday) {
            continue;
          }

          // Detectar padrão
          const pattern = await patternDetectionService.detectQuotePattern(producer.id);

          if (!pattern.hasPattern || pattern.confidence < 0.6) {
            continue;
          }

          // Verificar se deve sugerir hoje
          const lastQuote = producer.quotes[0];
          if (!lastQuote) {
            continue;
          }

          const shouldSuggest = patternDetectionService.shouldSuggestQuote(
            pattern,
            lastQuote.createdAt
          );

          if (!shouldSuggest) {
            continue;
          }

          // Enviar sugestão proativa
          const message = patternDetectionService.generateProactiveSuggestion(pattern);

          await whatsappService.sendMessage({
            to: producer.phone,
            body: message,
          });

          // Criar ou atualizar estado para aguardar resposta
          await prisma.conversationState.upsert({
            where: {
              producerId: producer.id,
            },
            create: {
              producerId: producer.id,
              tenantId: producer.tenantId,
              step: 'AWAITING_PROACTIVE_CHOICE',
              context: JSON.stringify({
                product: pattern.product,
                quantity: pattern.averageQuantity,
                unit: pattern.averageUnit,
              }),
            },
            update: {
              step: 'AWAITING_PROACTIVE_CHOICE',
              context: JSON.stringify({
                product: pattern.product,
                quantity: pattern.averageQuantity,
                unit: pattern.averageUnit,
              }),
            },
          });

          suggestions++;

          logger.info('Proactive suggestion sent', {
            producerId: producer.id,
            pattern,
          });

          // Delay para não spammar WhatsApp API
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error('Failed to send proactive suggestion', {
            error,
            producerId: producer.id,
          });
        }
      }

      logger.info('Proactive quotes job completed', { suggestions });
    } catch (error) {
      logger.error('Proactive quotes job failed', { error });
    }
  }
}

export const proactiveQuotesJob = new ProactiveQuotesJob();

/**
 * Registra o job de sugestões proativas para rodar diariamente às 08:00
 */
export function startProactiveQuotesJob(): void {
  // Executar todos os dias às 08:00
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running proactive quotes job (scheduled)');
    await proactiveQuotesJob.execute();
  });

  logger.info('Proactive quotes job scheduled (daily at 08:00)');
}
