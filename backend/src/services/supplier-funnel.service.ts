import { logger } from '../utils/logger';

/**
 * CO-3-11 — Eventos do funil do fornecedor.
 *
 * Emite 4 eventos para alimentar dashboard de funil:
 *   1. supplier.notified         dispatch enfileira mensagem para o fornecedor
 *   2. supplier.opened_link      fornecedor abriu o link do form (CO-3-04) OU
 *                                webhook de "read" indicando que viu a mensagem
 *   3. supplier.started_proposal fornecedor preencheu primeiro campo
 *                                (FSM saiu de SUPPLIER_AWAITING_INTEREST)
 *   4. supplier.submitted_proposal  proposta criada no banco
 *
 * Implementação atual: logger.info estruturado para PostHog/Sentry pegarem
 * do agregador. Quando PostHog SDK for adicionado, swap por captureEvent.
 */

export interface SupplierFunnelEvent {
  supplierId: string;
  quoteId: string;
  tenantId: string;
}

export class SupplierFunnelService {
  static notified(ev: SupplierFunnelEvent) {
    logger.info('supplier.notified', ev);
  }

  static openedLink(ev: SupplierFunnelEvent) {
    logger.info('supplier.opened_link', ev);
  }

  static startedProposal(ev: SupplierFunnelEvent) {
    logger.info('supplier.started_proposal', ev);
  }

  static submittedProposal(
    ev: SupplierFunnelEvent & { proposalId: string; totalValue: number },
  ) {
    logger.info('supplier.submitted_proposal', ev);
  }
}
