import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { ConversationContext } from '../types';

/**
 * FF-BE-015 — Smart Defaults a partir de lastQuotePreferences.
 *
 * Aplica valores da última cotação concluída do produtor para campos
 * NÃO informados na mensagem atual (RN-01: dado explícito sempre tem
 * prioridade sobre default). Marca quais campos vieram de default
 * para exibição "(padrão anterior)" no resumo (FF-BE-013).
 *
 * Decisões PO (FEAT-007 § US-03):
 *   - Ordem de prioridade dos defaults: freight, paymentTerms, region.
 *   - Primeira cotação (sem lastQuotePreferences) → não aplica defaults.
 *   - Defaults são SEMPRE explícitos no resumo, nunca silenciosos.
 */

export interface LastQuotePreferences {
  category?: string;
  items?: Array<{ product: string; quantity: number; unit: string }>;
  region?: string;
  deadline?: string;
  freight?: 'CIF' | 'FOB';
  paymentTerms?: string;
}

export interface ApplyDefaultsResult {
  context: ConversationContext;
  defaulted: Array<keyof LastQuotePreferences>;
}

/**
 * Campos que aceitam default. Deadline e items NÃO entram aqui —
 * são específicos da cotação atual e não devem ser herdados.
 */
const DEFAULTABLE_FIELDS: Array<keyof LastQuotePreferences> = [
  'freight',
  'paymentTerms',
  'region',
];

export class SmartDefaultsService {
  /**
   * Lê lastQuotePreferences do produtor. Retorna null se não existir
   * ou estiver malformado.
   */
  static async loadFor(producerId: string): Promise<LastQuotePreferences | null> {
    try {
      const producer = await prisma.producer.findUnique({
        where: { id: producerId },
        select: { lastQuotePreferences: true },
      });
      if (!producer?.lastQuotePreferences) return null;
      const prefs = producer.lastQuotePreferences as any;
      if (typeof prefs !== 'object') return null;
      return prefs as LastQuotePreferences;
    } catch (error) {
      logger.warn('Failed to load lastQuotePreferences', { error, producerId });
      return null;
    }
  }

  /**
   * Aplica defaults nos campos AINDA NÃO PREENCHIDOS no contexto.
   * Não sobrescreve valores explícitos (RN-01).
   */
  static apply(
    context: ConversationContext,
    prefs: LastQuotePreferences | null,
  ): ApplyDefaultsResult {
    if (!prefs) return { context, defaulted: [] };

    const next: ConversationContext = { ...context, items: context.items ? [...context.items] : [] };
    const defaulted: Array<keyof LastQuotePreferences> = [];

    for (const field of DEFAULTABLE_FIELDS) {
      if (!prefs[field]) continue;

      // Mapeamento prefs → ConversationContext
      switch (field) {
        case 'freight':
          if (!next.freight && (prefs.freight === 'CIF' || prefs.freight === 'FOB')) {
            next.freight = prefs.freight;
            defaulted.push('freight');
          }
          break;
        case 'paymentTerms':
          if (!next.quotePaymentTerms && prefs.paymentTerms) {
            next.quotePaymentTerms = prefs.paymentTerms;
            defaulted.push('paymentTerms');
          }
          break;
        case 'region':
          if (!next.region && prefs.region) {
            next.region = prefs.region;
            defaulted.push('region');
          }
          break;
      }
    }

    return { context: next, defaulted };
  }
}
