import { Queue, Job } from 'bull';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ErpWebhookService } from '../services/erp-webhook.service';

/**
 * CO-8-02 — Job assíncrono de envio do webhook ERP.
 *
 * Retry: 5x com backoff exponencial (5s, 25s, 125s, 625s, 3125s).
 * Após 5 falhas o job vai para "failed" e o admin do tenant precisa ser notificado
 * (futuro: integrar com SystemAlert + email).
 */

let queue: Queue<{ purchaseOrderId: string }> | null = null;

function getQueue() {
  if (queue) return queue;
  const Bull = require('bull') as typeof import('bull');
  queue = new Bull('send-erp-webhook', env.REDIS_URL, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
  queue.process(processSendErpWebhookJob);
  return queue;
}

export async function enqueueErpWebhook(purchaseOrderId: string): Promise<void> {
  await getQueue().add({ purchaseOrderId });
  logger.info('erp_webhook.enqueued', { purchaseOrderId });
}

export async function processSendErpWebhookJob(
  job: Job<{ purchaseOrderId: string }>,
): Promise<void> {
  const { purchaseOrderId } = job.data;
  logger.info('erp_webhook.processing', {
    purchaseOrderId,
    attempt: job.attemptsMade + 1,
  });
  await ErpWebhookService.send(purchaseOrderId);
}
