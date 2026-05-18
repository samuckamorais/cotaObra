import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const LOCK_PREFIX = 'quote:processing:';
const DEFAULT_TTL_SECONDS = 30;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_INTERVAL_MS = 100;

export interface LockOptions {
  ttlSeconds?: number;
  /** Tempo máximo aguardando adquirir o lock antes de desistir (ms) */
  timeoutMs?: number;
  /** Intervalo entre tentativas de aquisição (ms) */
  retryIntervalMs?: number;
}

/**
 * Serviço de lock distribuído via Redis para serializar o processamento de cotações.
 *
 * Usa o comando SET key value NX EX ttl — operação atômica no Redis.
 * Garante que apenas um job (consolidate ou expire) processa cada cotação por vez.
 */
export class JobLockService {
  static lockKey(quoteId: string): string {
    return `${LOCK_PREFIX}${quoteId}`;
  }

  /**
   * Tenta adquirir lock exclusivo para uma cotação.
   * Retenta a cada `retryIntervalMs` até atingir `timeoutMs`.
   *
   * @returns true se lock adquirido, false se timeout expirou
   */
  static async acquire(
    quoteId: string,
    jobName: string,
    options?: LockOptions,
  ): Promise<boolean> {
    const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryInterval = options?.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
    const key = this.lockKey(quoteId);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      // SET key jobName EX ttl NX — atômico: só seta se chave não existe
      const result = await redis.set(key, jobName, 'EX', ttl, 'NX');
      if (result === 'OK') {
        logger.info('Job lock acquired', { quoteId, jobName, key });
        return true;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, retryInterval));
    }

    const heldBy = await redis.get(key);
    logger.warn('Job lock timeout — skipping quote', { quoteId, jobName, heldBy });
    return false;
  }

  /**
   * Libera o lock somente se ainda pertencer a este job.
   * Protege contra liberar lock que expirou e foi adquirido por outro job.
   */
  static async release(quoteId: string, jobName: string): Promise<void> {
    const key = this.lockKey(quoteId);
    const heldBy = await redis.get(key);
    if (heldBy === jobName) {
      await redis.del(key);
      logger.info('Job lock released', { quoteId, jobName });
    }
  }

  /** Verifica se há lock ativo para a cotação (sem tentar adquirir). */
  static async isLocked(quoteId: string): Promise<boolean> {
    const value = await redis.get(this.lockKey(quoteId));
    return value !== null;
  }
}
