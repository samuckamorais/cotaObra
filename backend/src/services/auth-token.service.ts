import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const REFRESH_PREFIX = 'refresh:';
const BLACKLIST_PREFIX = 'blacklist:';

/**
 * Serviço de gerenciamento de tokens de autenticação via Redis.
 *
 * - Refresh tokens: armazenados com chave `refresh:{userId}:{tokenId}`, TTL = duração do refresh token
 * - Blacklist de access tokens: chave `blacklist:{jti}`, TTL = tempo restante do JWT
 *
 * Se Redis estiver indisponível, refresh e blacklist falham de forma segura:
 * - refresh: retorna erro ao usuário (precisa relogar)
 * - blacklist check: aceita o token (fail-open, pois o access token já tem vida curta de 15min)
 */
export class AuthTokenService {
  /**
   * Gera um ID único para o refresh token e o armazena no Redis.
   * Retorna o tokenId que será assinado no JWT do refresh token.
   */
  static async storeRefreshToken(
    userId: string,
    tokenId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const key = `${REFRESH_PREFIX}${userId}:${tokenId}`;
    await redis.setex(key, ttlSeconds, JSON.stringify({ userId, createdAt: Date.now() }));
  }

  /**
   * Valida se o refresh token ainda existe no Redis (não foi revogado).
   */
  static async validateRefreshToken(userId: string, tokenId: string): Promise<boolean> {
    try {
      const key = `${REFRESH_PREFIX}${userId}:${tokenId}`;
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (err) {
      logger.error('Failed to validate refresh token in Redis', { userId, error: String(err) });
      return false;
    }
  }

  /**
   * Revoga um refresh token específico (logout de uma sessão).
   */
  static async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    try {
      const key = `${REFRESH_PREFIX}${userId}:${tokenId}`;
      await redis.del(key);
    } catch (err) {
      logger.warn('Failed to revoke refresh token in Redis', { userId, error: String(err) });
    }
  }

  /**
   * Revoga todos os refresh tokens do usuário (logout de todas as sessões).
   */
  static async revokeAllRefreshTokens(userId: string): Promise<void> {
    try {
      const pattern = `${REFRESH_PREFIX}${userId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      logger.warn('Failed to revoke all refresh tokens', { userId, error: String(err) });
    }
  }

  /**
   * Adiciona um access token (via jti) na blacklist.
   * TTL = tempo restante do JWT para não acumular lixo no Redis.
   */
  static async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    try {
      if (ttlSeconds <= 0) return; // já expirou, não precisa blacklistar
      const key = `${BLACKLIST_PREFIX}${jti}`;
      await redis.setex(key, ttlSeconds, '1');
    } catch (err) {
      logger.warn('Failed to blacklist access token', { jti, error: String(err) });
    }
  }

  /**
   * Verifica se um access token está na blacklist.
   * Fail-open: se Redis estiver fora, retorna false (token aceito).
   * Risco mitigado pelo TTL curto do access token (15min).
   */
  static async isBlacklisted(jti: string): Promise<boolean> {
    try {
      const key = `${BLACKLIST_PREFIX}${jti}`;
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (err) {
      logger.warn('Redis unavailable for blacklist check — fail-open', { jti, error: String(err) });
      return false;
    }
  }

  /**
   * Gera um ID único para tokens (jti / tokenId).
   */
  static generateTokenId(): string {
    return crypto.randomUUID();
  }
}
