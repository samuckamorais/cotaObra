import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { ConversationContext } from '../types';

/**
 * FF-BE-022 — Buffer da mensagem rica que chegou durante outra cotação.
 *
 * Quando o produtor está em qualquer estado != IDLE/CLOSED e manda uma
 * mensagem com 2+ campos válidos, o sistema NÃO pode descartar o NLU
 * já feito. Guarda o smartFillContext no Redis (TTL 5 min) e pergunta
 * "Cancelar a anterior?". Se sim → recupera e segue smart fill;
 * se "continuar" → descarta buffer e devolve para o handler do estado.
 */

const TTL_S = 5 * 60;
const KEY_PREFIX = 'midflow_buffer:';

export interface MidFlowBufferEntry {
  /** Contexto novo construído pelo SmartFillService.buildContext */
  newContext: ConversationContext;
  /** Estado da conversa que foi interrompido */
  interruptedState: string;
  /** Mensagem original do produtor (para auditoria/debug) */
  originalMessage: string;
  /** Quantos campos vieram do NLU multi-slot */
  fieldsExtracted: number;
  storedAt: string;
}

export class MidFlowBufferService {
  static async set(producerId: string, entry: MidFlowBufferEntry): Promise<void> {
    try {
      await redis.setex(`${KEY_PREFIX}${producerId}`, TTL_S, JSON.stringify(entry));
    } catch (err) {
      logger.warn('mid-flow buffer set failed', { err, producerId });
    }
  }

  static async get(producerId: string): Promise<MidFlowBufferEntry | null> {
    try {
      const raw = await redis.get(`${KEY_PREFIX}${producerId}`);
      if (!raw) return null;
      return JSON.parse(raw) as MidFlowBufferEntry;
    } catch {
      return null;
    }
  }

  static async clear(producerId: string): Promise<void> {
    try {
      await redis.del(`${KEY_PREFIX}${producerId}`);
    } catch {
      /* noop */
    }
  }
}
