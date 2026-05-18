import Bull from 'bull';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Configuração das filas Bull (Redis)
 */

// Fila para disparo de cotações
export const quoteDispatchQueue = new Bull('quote-dispatch', env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100, // manter últimos 100 jobs completos
    removeOnFail: 200, // manter últimos 200 jobs com falha
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Event handlers
quoteDispatchQueue.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, queue: 'quote-dispatch' });
});

quoteDispatchQueue.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    queue: 'quote-dispatch',
    error: err.message,
  });
});

quoteDispatchQueue.on('error', (error) => {
  logger.error('Queue error', { queue: 'quote-dispatch', error });
});

// FEAT-PDF-001 — Fila para geração + envio do PDF de resultado.
// jobId determinístico (pdf:<quoteId>) garante idempotência: se a mesma
// cotação for enfileirada duas vezes, Bull deduplica.
export const quotePdfQueue = new Bull('quote-pdf-generation', env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
    timeout: 30000, // 30s — geração + upload + envio
  },
});

quotePdfQueue.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id, queue: 'quote-pdf-generation' });
});
quotePdfQueue.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    queue: 'quote-pdf-generation',
    attempt: job?.attemptsMade,
    error: err.message,
  });
});
quotePdfQueue.on('error', (error) => {
  logger.error('Queue error', { queue: 'quote-pdf-generation', error });
});

logger.info('✅ Bull queues configured');
