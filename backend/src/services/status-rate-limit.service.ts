import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const KEY_PREFIX = 'producer_status_check:';
const WINDOW_SECONDS = 60 * 60; // 1h
const MAX_CHECKS = 5;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSec?: number;
}

/**
 * Rate limit para consultas de status via WhatsApp.
 *
 * Implementação Redis (INCR + EXPIRE) com janela deslizante simples
 * de 1h. Limite: 5 consultas por produtor por hora.
 *
 * Em caso de falha de Redis, libera a consulta (fail-open) — preferimos
 * permitir uso a bloquear o produtor por um problema de infra.
 */
export class StatusCheckRateLimit {
  static async check(producerId: string): Promise<RateLimitResult> {
    const key = `${KEY_PREFIX}${producerId}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }

      if (count > MAX_CHECKS) {
        const ttl = await redis.ttl(key);
        return {
          allowed: false,
          count,
          retryAfterSec: ttl > 0 ? ttl : WINDOW_SECONDS,
        };
      }

      return { allowed: true, count };
    } catch (error) {
      logger.warn('Status rate limit Redis error — fail-open', { producerId, error });
      return { allowed: true, count: 0 };
    }
  }

  /**
   * Apenas para testes — limpa o contador.
   */
  static async reset(producerId: string): Promise<void> {
    try {
      await redis.del(`${KEY_PREFIX}${producerId}`);
    } catch {
      // ignore
    }
  }
}
