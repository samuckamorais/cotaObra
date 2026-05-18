import { quotePdfQueue } from './queue.config';
import { env } from '../config/env';
import { logger, logWithContext } from '../utils/logger';
import { PdfGenerationService } from '../services/pdf-generation.service';
import { MinioStorage } from '../services/storage/minio.storage';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { FSMEventService } from '../services/fsm-event.service';
import { Messages } from '../flows/messages';

/**
 * FEAT-PDF-001 — Job de geração + envio do PDF de resultado.
 *
 * Caminho feliz:
 *   1. Verifica feature flag PDF_GENERATION_ENABLED (§14.4)
 *   2. Verifica se PDF já está no MinIO (idempotente — §14.8)
 *      Se existir, pula geração e só renova a presigned URL.
 *   3. Gera PDF via PdfGenerationService
 *   4. Upload no MinIO
 *   5. Presigned URL (TTL configurável)
 *   6. Envia via Twilio MediaUrl
 *
 * Falha:
 *   - Erros transientes: Bull faz retry exponencial (2s/4s/8s).
 *   - Após esgotar attempts: envia mensagem de texto com link do dashboard.
 *
 * Idempotência:
 *   - jobId determinístico = `pdf:<quoteId>`. Mesma cotação não duplica
 *     uploads em uma janela curta. Reenvios manuais usam o flag `resent`.
 */

export interface GeneratePdfJobData {
  quoteId: string;
  tenantId: string;
  producerId: string;
  producerPhone: string;
  /** Marca de reenvio (POST /pdf/resend). Apenas para telemetria. */
  resent?: boolean;
}

/**
 * Enfileira o job de PDF. Chamada pelo flow ao fechar a cotação.
 * Respeita o kill-switch PDF_GENERATION_ENABLED — quando off, registra
 * pdf_generation_skipped e retorna sem enfileirar.
 */
export async function enqueueQuotePdfJob(data: GeneratePdfJobData): Promise<void> {
  if (!env.PDF_GENERATION_ENABLED) {
    logger.warn('PDF generation disabled by feature flag (PDF_GENERATION_ENABLED=false)', {
      quoteId: data.quoteId,
    });
    await FSMEventService.track({
      producerId: data.producerId,
      eventType: 'pdf_generation_skipped',
      payload: { quoteId: data.quoteId, reason: 'feature_flag_off' },
    });
    return;
  }

  try {
    await quotePdfQueue.add(data, {
      jobId: data.resent ? `pdf:${data.quoteId}:${Date.now()}` : `pdf:${data.quoteId}`,
    });
    logger.info('Quote PDF job enqueued', {
      quoteId: data.quoteId,
      resent: data.resent === true,
    });
  } catch (err) {
    // Falha de enqueue não pode quebrar o fechamento da cotação (AC-06).
    // Loga e segue.
    logger.error('Failed to enqueue quote PDF job (cotação continua fechada)', {
      quoteId: data.quoteId,
      error: (err as Error).message,
    });
  }
}

/**
 * Processor do job. Executa as 6 etapas do pipeline.
 */
quotePdfQueue.process(async (job) => {
  const { quoteId, tenantId, producerId, producerPhone, resent } =
    job.data as GeneratePdfJobData;
  const attempt = job.attemptsMade + 1;

  logWithContext('info', 'Processing PDF job', { quoteId, attempt });

  await FSMEventService.track({
    producerId,
    eventType: 'pdf_generation_started',
    payload: { quoteId, attempt, resent: !!resent },
  });

  // ----------------------------------------------------------
  // 1+2. Idempotência: PDF já existe?
  // ----------------------------------------------------------
  const key = MinioStorage.buildQuotePdfKey(tenantId, quoteId);
  const filename = PdfGenerationService.buildFilename(quoteId);

  let exists = false;
  try {
    exists = await MinioStorage.exists(key);
  } catch (err) {
    logger.warn('MinIO exists check failed (vai gerar de novo)', {
      quoteId,
      error: (err as Error).message,
    });
  }

  // ----------------------------------------------------------
  // 3+4. Geração + upload (pula se já existe)
  // ----------------------------------------------------------
  if (!exists) {
    const genStartedAt = Date.now();
    try {
      const { buffer } = await PdfGenerationService.generateQuoteResultPdf({
        tenantId,
        quoteId,
      });
      await MinioStorage.uploadPdf(key, buffer);
      const durationMs = Date.now() - genStartedAt;
      await FSMEventService.track({
        producerId,
        eventType: 'pdf_generation_completed',
        payload: { quoteId, fileSizeBytes: buffer.length, durationMs },
      });
    } catch (err) {
      await FSMEventService.track({
        producerId,
        eventType: 'pdf_generation_failed',
        payload: { quoteId, error: (err as Error).message, attempt },
      });
      // Re-throw para Bull fazer retry. Após esgotar, cai no on('failed').
      throw err;
    }
  } else {
    logger.info('PDF já existe no MinIO — pulando geração (idempotência)', { quoteId, key });
  }

  // ----------------------------------------------------------
  // 5. Presigned URL (sempre gera nova — TTL renovado)
  // ----------------------------------------------------------
  const ttlSeconds = env.PDF_PRESIGN_TTL_DAYS * 24 * 60 * 60;
  const mediaUrl = await MinioStorage.getPresignedUrl(key, ttlSeconds);

  // ----------------------------------------------------------
  // 6. Envio via Twilio
  // ----------------------------------------------------------
  const sendStartedAt = Date.now();
  try {
    await whatsappService.sendDocument({
      to: producerPhone,
      mediaUrl,
      filename,
      caption: 'Aqui está o resultado da sua cotação.',
      mimeType: 'application/pdf',
    });

    await FSMEventService.track({
      producerId,
      eventType: 'pdf_delivery_completed',
      payload: {
        quoteId,
        durationMs: Date.now() - sendStartedAt,
        resent: !!resent,
      },
    });

    logger.info('PDF delivery completed', {
      quoteId,
      durationMs: Date.now() - sendStartedAt,
    });
  } catch (err) {
    const twilioErr = err as { code?: number; status?: number; message?: string };
    const isFourXX =
      typeof twilioErr.status === 'number' && twilioErr.status >= 400 && twilioErr.status < 500;

    await FSMEventService.track({
      producerId,
      eventType: 'pdf_delivery_failed',
      payload: {
        quoteId,
        attempt,
        twilioErrorCode: twilioErr.code,
        httpStatus: twilioErr.status,
        message: twilioErr.message,
      },
    });

    // 4xx é definitivo — não vale retry. Faz fallback texto agora.
    if (isFourXX) {
      await sendFallbackText({ quoteId, producerId, producerPhone });
      return;
    }

    // 5xx: deixa Bull retry. Quando esgotar, on('failed') chama fallback.
    throw err;
  }
});

// On final failure (depois de esgotar attempts), envia o fallback texto.
quotePdfQueue.on('failed', async (job, _err) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  // O Bull dispara `failed` em cada attempt. Só queremos rodar o
  // fallback após a ÚLTIMA tentativa.
  const maxAttempts = job?.opts?.attempts ?? 3;
  if (attemptsMade < maxAttempts) return;

  const { quoteId, producerId, producerPhone } = (job?.data ?? {}) as GeneratePdfJobData;
  if (!producerPhone) return;

  await sendFallbackText({ quoteId, producerId, producerPhone });
});

/**
 * Envia o texto de fallback com link para o dashboard.
 * Não lança — falha em fallback não tem outro recurso.
 */
async function sendFallbackText(args: {
  quoteId: string;
  producerId: string;
  producerPhone: string;
}): Promise<void> {
  try {
    const dashboardUrl = `${env.FRONTEND_URL}/quotes/${args.quoteId}`;
    await whatsappService.sendMessage({
      to: args.producerPhone,
      body: Messages.PDF_DELIVERY_FAILED(dashboardUrl),
    });
    await FSMEventService.track({
      producerId: args.producerId,
      eventType: 'pdf_fallback_text_sent',
      payload: { quoteId: args.quoteId },
    });
  } catch (err) {
    logger.error('PDF fallback text also failed (sem mais recurso)', {
      quoteId: args.quoteId,
      error: (err as Error).message,
    });
  }
}
