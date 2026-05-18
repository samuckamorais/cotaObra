import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { SupplierState, ConversationContext } from '../types';

const REDIS_KEY_PREFIX = 'supplier_state:';
const DEFAULT_TTL_HOURS = 2;

export interface SupplierStateData {
  state: SupplierState;
  context: ConversationContext;
}

export interface SetStateOptions {
  ttlHours?: number;
  tenantId?: string | null;
}

/**
 * Serviço de estado da conversa do fornecedor.
 *
 * Estratégia de persistência:
 * - LEITURA: Redis primeiro (cache quente) → PostgreSQL (fallback resiliente)
 * - ESCRITA: PostgreSQL primeiro (fonte da verdade) → Redis (cache, falha silenciosa)
 *
 * Garante que fornecedores não perdem o andamento da proposta se o Redis
 * reiniciar ou ficar indisponível.
 */
export class SupplierStateService {
  private static redisKey(supplierId: string): string {
    return `${REDIS_KEY_PREFIX}${supplierId}`;
  }

  /**
   * Lê estado do fornecedor com read-through cache.
   *
   * 1. Tenta Redis (rápido, ~1ms)
   * 2. Se Redis falhar → PostgreSQL (robusto)
   * 3. Após leitura do banco, re-aquece cache Redis com TTL restante
   *
   * Retorna null se o estado não existe ou está expirado.
   */
  static async get(supplierId: string): Promise<SupplierStateData | null> {
    // ── 1. Cache Redis ──────────────────────────────────────────────────
    try {
      const cached = await redis.get(this.redisKey(supplierId));
      if (cached) {
        return JSON.parse(cached) as SupplierStateData;
      }
    } catch (redisErr) {
      logger.warn('Redis unavailable — falling back to PostgreSQL for supplier state', {
        supplierId,
        error: String(redisErr),
      });
    }

    // ── 2. PostgreSQL fallback ──────────────────────────────────────────
    const record = await prisma.supplierConversationState.findUnique({
      where: { supplierId },
    });

    if (!record) return null;

    // Estado expirado — limpar e retornar null
    if (record.expiresAt < new Date()) {
      await prisma.supplierConversationState
        .deleteMany({ where: { supplierId } })
        .catch(() => {});
      return null;
    }

    const data: SupplierStateData = {
      state: record.step as SupplierState,
      context: record.context as unknown as ConversationContext,
    };

    // ── 3. Re-aquecer cache Redis com TTL restante ──────────────────────
    try {
      const remainingTtlSec = Math.floor(
        (record.expiresAt.getTime() - Date.now()) / 1000,
      );
      if (remainingTtlSec > 0) {
        await redis.setex(
          this.redisKey(supplierId),
          remainingTtlSec,
          JSON.stringify(data),
        );
        logger.info('Supplier state re-cached from PostgreSQL', { supplierId });
      }
    } catch {
      // Redis offline — estado seguro no PostgreSQL, continuar normalmente
    }

    return data;
  }

  /**
   * Persiste estado com write-through.
   *
   * PostgreSQL primeiro (durável), Redis depois (cache).
   * Se Redis falhar, o estado está seguro no PostgreSQL.
   */
  static async set(
    supplierId: string,
    state: SupplierState,
    context: ConversationContext,
    options?: SetStateOptions,
  ): Promise<void> {
    const ttlHours = options?.ttlHours ?? DEFAULT_TTL_HOURS;
    const tenantId = options?.tenantId ?? null;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const quoteId = context.quoteId ?? null;

    // ── PostgreSQL (fonte da verdade) ───────────────────────────────────
    await prisma.supplierConversationState.upsert({
      where: { supplierId },
      create: {
        supplierId,
        tenantId,
        quoteId,
        step: state,
        context: context as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
      update: {
        quoteId,
        step: state,
        context: context as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    // ── Redis (cache — falha silenciosa) ────────────────────────────────
    try {
      const ttlSeconds = ttlHours * 60 * 60;
      await redis.setex(
        this.redisKey(supplierId),
        ttlSeconds,
        JSON.stringify({ state, context }),
      );
    } catch (redisErr) {
      logger.warn('Redis write failed — supplier state saved only in PostgreSQL', {
        supplierId,
        error: String(redisErr),
      });
    }
  }

  /**
   * Remove estado de Redis e PostgreSQL.
   * PostgreSQL é deletado primeiro; falha no Redis não impede a remoção.
   */
  static async delete(supplierId: string): Promise<void> {
    // PostgreSQL
    await prisma.supplierConversationState.deleteMany({ where: { supplierId } });

    // Redis (falha silenciosa)
    try {
      await redis.del(this.redisKey(supplierId));
    } catch (redisErr) {
      logger.warn('Redis delete failed — state removed from PostgreSQL', {
        supplierId,
        error: String(redisErr),
      });
    }
  }
}
