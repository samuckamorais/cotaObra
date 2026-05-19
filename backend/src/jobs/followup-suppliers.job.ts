import cron from 'node-cron';
import { prisma } from '../config/database';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { logger } from '../utils/logger';

const MAX_FOLLOWUPS = 2;

/**
 * Gera mensagem do 1o lembrete (tom amigável, 24h sem resposta).
 */
/**
 * CO-3-06 — texto adaptado para construção. "produtor" → "construtora".
 */
export function buildFirstFollowUp(data: {
  supplierName: string;
  producerName: string;
  product: string;
  quantity: number;
  unit: string;
  deadline: string;
}): string {
  return (
    `Olá ${data.supplierName}! Tudo bem?\n\n` +
    `A construtora *${data.producerName}* está aguardando sua cotação para:\n` +
    `*${data.product}* — ${data.quantity} ${data.unit}\n\n` +
    `A cotação está aberta até *${data.deadline}*.\n` +
    `Para enviar sua proposta, responda com o preço por ${data.unit}.\n\n` +
    `_CotaObra — Cotação de materiais de construção_`
  );
}

/**
 * Gera mensagem do 2o lembrete (tom de urgência, 48h sem resposta).
 */
export function buildSecondFollowUp(data: {
  supplierName: string;
  producerName: string;
  product: string;
  unit: string;
  deadline: string;
}): string {
  return (
    `Olá ${data.supplierName}! Último lembrete.\n\n` +
    `A cotação de *${data.product}* da construtora *${data.producerName}*\n` +
    `encerra em breve (*${data.deadline}*).\n\n` +
    `Se ainda tiver interesse, responda agora com seu preço por ${data.unit}.\n` +
    `Após o prazo, a cotação será encerrada automaticamente.\n\n` +
    `_CotaObra_`
  );
}

/**
 * Busca notificações pendentes de follow-up e retorna as elegíveis.
 */
export async function findPendingFollowUps() {
  const now = new Date();
  const threshold24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threshold48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  return prisma.quoteSupplierNotification.findMany({
    where: {
      followUpCount: { lt: MAX_FOLLOWUPS },
      quote: { status: 'COLLECTING' },
      // Fornecedor não enviou proposta
      supplier: {
        proposals: {
          none: {
            quoteId: { not: undefined }, // referência ao quoteId da notification
          },
        },
      },
      OR: [
        // 1o follow-up: 24h+ sem resposta, 0 follow-ups
        { followUpCount: 0, notifiedAt: { lte: threshold24h } },
        // 2o follow-up: 24h+ após último follow-up
        { followUpCount: 1, lastFollowUpAt: { lte: threshold48h } },
      ],
    },
    include: {
      supplier: true,
      quote: {
        include: {
          producer: true,
          items: true,
          proposals: { select: { supplierId: true } },
        },
      },
    },
  });
}

/**
 * Processa follow-ups para uma lista de notificações.
 */
export async function processFollowUps(): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const notifications = await findPendingFollowUps();

  for (const notification of notifications) {
    // Verificar se fornecedor já respondeu (proposta existe)
    const hasProposal = notification.quote.proposals.some(
      (p) => p.supplierId === notification.supplierId,
    );
    if (hasProposal) {
      skipped++;
      continue;
    }

    // Verificar se cotação ainda está aberta
    if (notification.quote.status !== 'COLLECTING') {
      skipped++;
      continue;
    }

    const product = notification.quote.items[0]?.product || notification.quote.product || 'produto';
    const quantity = notification.quote.items[0]?.quantity || 0;
    const unit = notification.quote.items[0]?.unit || 'unidades';
    const deadline = notification.quote.deadline?.toLocaleDateString('pt-BR') || 'em breve';

    try {
      const message = notification.followUpCount === 0
        ? buildFirstFollowUp({
            supplierName: notification.supplier.name,
            producerName: notification.quote.producer.name,
            product,
            quantity,
            unit,
            deadline,
          })
        : buildSecondFollowUp({
            supplierName: notification.supplier.name,
            producerName: notification.quote.producer.name,
            product,
            unit,
            deadline,
          });

      await whatsappService.sendMessage({
        to: notification.supplier.phone,
        body: message,
      });

      await prisma.quoteSupplierNotification.update({
        where: { id: notification.id },
        data: {
          followUpCount: { increment: 1 },
          lastFollowUpAt: new Date(),
        },
      });

      sent++;
      logger.info('Follow-up sent', {
        supplierId: notification.supplierId,
        quoteId: notification.quoteId,
        followUpNumber: notification.followUpCount + 1,
      });
    } catch (err) {
      errors++;
      logger.error('Failed to send follow-up', {
        supplierId: notification.supplierId,
        quoteId: notification.quoteId,
        error: String(err),
      });
    }

    // Delay para não spammar WhatsApp API
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { sent, skipped, errors };
}

/**
 * Job cron que roda a cada hora para enviar follow-ups.
 */
export function startFollowUpSuppliersJob(): void {
  cron.schedule('0 * * * *', async () => {
    logger.info('Running follow-up suppliers job');

    try {
      const result = await processFollowUps();
      logger.info('Follow-up suppliers job completed', result);
    } catch (error) {
      logger.error('Error in follow-up suppliers job', { error });
    }
  });

  logger.info('✅ Follow-up suppliers job scheduled (every hour)');
}
