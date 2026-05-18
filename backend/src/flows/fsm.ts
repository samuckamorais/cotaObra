import { prisma } from '../config/database';
import { ConversationContext } from '../types';
import { logger } from '../utils/logger';
import { metricsService } from '../services/metrics.service';
import { FSMEventService } from '../services/fsm-event.service';

/**
 * Engine genérica da Máquina de Estados Finitos (FSM)
 * Gerencia transições, persistência de estado e contexto de conversação
 */
export class FSMEngine<TState extends string> {
  // Armazena timestamp da entrada no estado atual (para calcular duração)
  private stateTimestamps = new Map<string, number>();

  /**
   * Valida se o contexto possui os campos obrigatórios para o estado dado.
   * Retorna null se válido, ou mensagem de erro se inválido.
   */
  static validateContext(state: string, context: Record<string, unknown>): string | null {
    const items = context.items as unknown[] | undefined;
    const hasItems = Array.isArray(items) && items.length > 0;
    const hasProduct = !!context.product || (hasItems && !!(items[items.length - 1] as Record<string, unknown>)?.product);
    const hasRegion = !!context.region;
    const hasDeadline = !!context.deadline;
    const hasFreight = !!context.freight;
    const hasPaymentTerms = !!context.paymentTerms;
    const hasSupplierScope = !!context.supplierScope;

    const requirements: Record<string, () => string | null> = {
      AWAITING_QUANTITY: () => {
        if (!hasProduct) return 'Preciso saber o produto antes de continuar. Qual produto você precisa cotar?';
        return null;
      },
      AWAITING_REGION: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        return null;
      },
      AWAITING_DEADLINE: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasRegion) return 'Preciso saber a região de entrega. Qual a cidade/região?';
        return null;
      },
      AWAITING_OBSERVATIONS: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasRegion) return 'Preciso saber a região de entrega. Qual a cidade/região?';
        if (!hasDeadline) return 'Preciso saber o prazo de entrega. Até quando precisa receber?';
        return null;
      },
      AWAITING_FREIGHT: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasRegion) return 'Preciso saber a região de entrega. Qual a cidade/região?';
        if (!hasDeadline) return 'Preciso saber o prazo de entrega. Até quando precisa receber?';
        return null;
      },
      AWAITING_PAYMENT_TERMS: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasFreight) return 'Preciso saber o tipo de frete antes de continuar.';
        return null;
      },
      AWAITING_SUPPLIER_SCOPE: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasFreight) return 'Preciso saber o tipo de frete antes de continuar.';
        if (!hasPaymentTerms) return 'Preciso saber a condição de pagamento antes de continuar.';
        return null;
      },
      AWAITING_CONFIRMATION: () => {
        if (!hasItems) return 'Preciso dos itens da cotação antes de continuar.';
        if (!hasRegion) return 'Preciso saber a região de entrega. Qual a cidade/região?';
        if (!hasDeadline) return 'Preciso saber o prazo de entrega. Até quando precisa receber?';
        if (!hasSupplierScope) return 'Preciso saber para quais fornecedores enviar.';
        return null;
      },
    };

    const validator = requirements[state];
    if (!validator) return null;
    return validator();
  }
  /**
   * Busca estado atual da conversa
   */
  async getState(entityId: string, entityType: 'producer' | 'supplier'): Promise<{
    step: TState;
    context: ConversationContext;
    expired?: boolean;
    minutesAgo?: number;
  } | null> {
    const TTL_MS = 30 * 60 * 1000; // 30 minutes

    if (entityType === 'producer') {
      const record = await prisma.conversationState.findUnique({
        where: { producerId: entityId },
      });

      if (!record) return null;

      const step = record.step as TState;
      const context = record.context as ConversationContext;

      // TTL check: if state is not terminal and has expired, flag it
      if (step !== ('IDLE' as unknown) && step !== ('QUOTE_ACTIVE' as unknown) && step !== ('CLOSED' as unknown)) {
        const updatedAt = record.updatedAt || new Date();
        const elapsed = Date.now() - new Date(updatedAt).getTime();
        if (elapsed > TTL_MS) {
          return {
            step,
            context,
            expired: true,
            minutesAgo: Math.floor(elapsed / 60000),
          };
        }
      }

      return {
        step,
        context,
      };
    }

    // Suppliers armazenam estado no Redis (temporário)
    // TODO: implementar se necessário
    return null;
  }

  /**
   * Atualiza estado da conversa
   */
  async setState(
    entityId: string,
    entityType: 'producer' | 'supplier',
    step: TState,
    context: ConversationContext,
    previousStep?: TState
  ): Promise<void> {
    // Calcular duração no estado anterior
    let durationMs: number | undefined;
    if (previousStep) {
      const key = `${entityId}:${previousStep}`;
      const startTime = this.stateTimestamps.get(key);
      if (startTime) {
        durationMs = Date.now() - startTime;
        this.stateTimestamps.delete(key);
      }
    }

    // Registrar entrada no novo estado
    const newKey = `${entityId}:${step}`;
    this.stateTimestamps.set(newKey, Date.now());

    if (entityType === 'producer') {
      const producer = await prisma.producer.findUniqueOrThrow({
        where: { id: entityId },
        select: { tenantId: true },
      });
      await prisma.conversationState.upsert({
        where: { producerId: entityId },
        create: {
          producerId: entityId,
          tenantId: producer.tenantId,
          step,
          context: context as object,
        },
        update: {
          step,
          context: context as object,
        },
      });

      logger.info('FSM state updated', { entityId, entityType, step });

      // FF-BE-009 — Hook universal: registra TODA transição em FSMEvent.
      // previousStep só é informado quando o caller passa explicitamente
      // (pelos producer/supplier flow handlers). Quando ausente, registra
      // como toState sem fromState (still útil pra detecção de abandono
      // e contagem de entradas em cada estado).
      const fromStr = previousStep ? String(previousStep) : null;
      const toStr = String(step);
      await FSMEventService.trackTransition(
        entityId,
        fromStr,
        toStr,
        durationMs ? { durationMs } : undefined,
      );

      // quote_started: marca início do funil (IDLE → primeiro AWAITING_*)
      if (fromStr === 'IDLE' && toStr !== 'IDLE' && toStr !== 'CLOSED') {
        await FSMEventService.track({
          producerId: entityId,
          eventType: 'quote_started',
          fromState: fromStr,
          toState: toStr,
        });
      }
    }

    // Trackear transição de estado
    if (previousStep) {
      await metricsService.trackEvent({
        userId: entityId,
        userType: entityType,
        eventType: 'state_changed',
        state: step as string,
        previousState: previousStep as string,
        durationMs,
      });
    }
  }

  /**
   * Reseta estado para IDLE
   */
  async resetState(entityId: string, entityType: 'producer' | 'supplier'): Promise<void> {
    if (entityType === 'producer') {
      await prisma.conversationState.update({
        where: { producerId: entityId },
        data: {
          step: 'IDLE',
          context: {},
        },
      });

      logger.info('FSM state reset', { entityId, entityType });
    }
  }

  /**
   * Valida se a transição é permitida
   */
  isValidTransition(currentState: TState, nextState: TState, validTransitions: Record<TState, TState[]>): boolean {
    const allowedNextStates = validTransitions[currentState];
    return allowedNextStates?.includes(nextState) || false;
  }

  /**
   * Trackeia mensagem recebida
   */
  async trackMessageReceived(
    entityId: string,
    entityType: 'producer' | 'supplier',
    currentState: TState,
    metadata?: Record<string, any>
  ): Promise<void> {
    await metricsService.trackEvent({
      userId: entityId,
      userType: entityType,
      eventType: 'message_received',
      state: currentState as string,
      metadata,
    });
  }

  /**
   * Trackeia mensagem enviada
   */
  async trackMessageSent(
    entityId: string,
    entityType: 'producer' | 'supplier',
    currentState: TState,
    metadata?: Record<string, any>
  ): Promise<void> {
    await metricsService.trackEvent({
      userId: entityId,
      userType: entityType,
      eventType: 'message_sent',
      state: currentState as string,
      metadata,
    });
  }

  /**
   * Trackeia erro
   */
  async trackError(
    entityId: string,
    entityType: 'producer' | 'supplier',
    currentState: TState,
    errorType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await metricsService.trackEvent({
      userId: entityId,
      userType: entityType,
      eventType: 'error',
      state: currentState as string,
      errorType,
      metadata,
    });
  }
}
