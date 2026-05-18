import { Client as MinioClient } from 'minio';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/error-handler';

/**
 * FEAT-PDF-001 — Wrapper minimalista do SDK do MinIO (S3-compatible).
 *
 * Caminho de dados:
 *   1) Backend faz upload via endpoint INTERNO (minio:9000) — sem TLS,
 *      rede docker, latência baixa.
 *   2) Backend gera presigned URL via endpoint PÚBLICO (Traefik HTTPS).
 *      Essa URL é o que vai pro Twilio MediaUrl. Twilio precisa
 *      conseguir acessar de fora do cluster.
 *
 * Por que dois endpoints separados:
 *   - Upload pelo interno é mais rápido e não consome banda externa.
 *   - Presigned URL precisa do domínio público pra Twilio funcionar.
 *
 * O MinIO Server respeita `MINIO_SERVER_URL` (env do container) — quando
 * o backend pede uma presigned URL via API interna, o MinIO assina com
 * o hostname público. Mas para robustez, instanciamos UM cliente para
 * uploads (interno) e UM para presigning (público).
 */

const BUCKET = env.MINIO_BUCKET;

/**
 * Cliente interno — usado para todas as operações que NÃO sejam
 * geração de presigned URL (upload, exists, delete, stat).
 */
function buildInternalClient(): MinioClient {
  const [host, portStr] = env.MINIO_INTERNAL_ENDPOINT.split(':');
  return new MinioClient({
    endPoint: host,
    port: portStr ? Number(portStr) : 9000,
    useSSL: false,
    accessKey: env.MINIO_ROOT_USER ?? '',
    secretKey: env.MINIO_ROOT_PASSWORD ?? '',
  });
}

/**
 * Cliente público — usado APENAS para presignedGetObject. Aponta para
 * o domínio HTTPS que o Traefik publica externamente. Sem esse cliente,
 * o SDK assinaria URLs com o hostname interno (`minio:9000`) e o Twilio
 * não conseguiria baixar.
 */
function buildPublicClient(): MinioClient | null {
  if (!env.MINIO_PUBLIC_URL) return null;
  const url = new URL(env.MINIO_PUBLIC_URL);
  return new MinioClient({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    useSSL: url.protocol === 'https:',
    accessKey: env.MINIO_ROOT_USER ?? '',
    secretKey: env.MINIO_ROOT_PASSWORD ?? '',
  });
}

let _internal: MinioClient | null = null;
let _public: MinioClient | null = null;
function internal(): MinioClient {
  if (!_internal) _internal = buildInternalClient();
  return _internal;
}
function publicClient(): MinioClient {
  if (!_public) _public = buildPublicClient();
  if (!_public) {
    // 500 conceitualmente, mas createError não tem internalServer —
    // badRequest expressa "configuração inválida no servidor" e o
    // middleware de erro converte AppError pra 4xx; quem chama o
    // wrapper deve garantir que MINIO_PUBLIC_URL esteja setado em prod.
    throw createError.badRequest(
      'MINIO_PUBLIC_URL não configurado — não é possível gerar presigned URL para o Twilio',
    );
  }
  return _public;
}

export class MinioStorage {
  /**
   * Upload de um Buffer no bucket. Sobrescreve se já existir (idempotente
   * por chave — o caller controla a chave para garantir idempotência).
   */
  static async uploadPdf(key: string, buffer: Buffer): Promise<void> {
    try {
      await internal().putObject(BUCKET, key, buffer, buffer.length, {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=0, no-store',
      });
      logger.info('MinIO upload OK', { bucket: BUCKET, key, size: buffer.length });
    } catch (err) {
      logger.error('MinIO upload failed', {
        bucket: BUCKET,
        key,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Gera URL HTTPS pública assinada para o `key` informado, válida por
   * `ttlSeconds`. Twilio busca o PDF nessa URL.
   *
   * IMPORTANTE: a URL contém um `X-Amz-Signature` — NUNCA loggar inteira.
   * O logger só registra o key e o TTL.
   */
  static async getPresignedUrl(key: string, ttlSeconds: number): Promise<string> {
    try {
      const url = await publicClient().presignedGetObject(BUCKET, key, ttlSeconds);
      logger.info('MinIO presigned URL generated', { key, ttlSeconds });
      return url;
    } catch (err) {
      logger.error('MinIO presigned URL failed', {
        key,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Retorna true se o objeto existe no bucket. Usado pelo job de
   * reenvio idempotente — se PDF já está armazenado, não regera
   * (FF §14.8).
   */
  static async exists(key: string): Promise<boolean> {
    try {
      await internal().statObject(BUCKET, key);
      return true;
    } catch (err) {
      // SDK lança NotFound como Error com message contendo "Not Found"
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return false;
      // Qualquer outro erro propaga — não queremos esconder problema de rede.
      throw err;
    }
  }

  /**
   * Delete idempotente (não lança se o objeto já não existe).
   */
  static async delete(key: string): Promise<void> {
    try {
      await internal().removeObject(BUCKET, key);
      logger.info('MinIO object deleted', { bucket: BUCKET, key });
    } catch (err) {
      logger.warn('MinIO delete failed (ignored)', {
        key,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Health check rápido — usado pelo healthcheck endpoint do backend
   * pra reportar se MinIO está OK.
   */
  static async ping(): Promise<boolean> {
    try {
      await internal().bucketExists(BUCKET);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convenção de keys (§5.2 da spec).
   * tenants/{tenantId}/quotes/{YYYY}/{MM}/{quoteId}.pdf
   */
  static buildQuotePdfKey(tenantId: string, quoteId: string, date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `tenants/${tenantId}/quotes/${year}/${month}/${quoteId}.pdf`;
  }
}
