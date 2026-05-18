import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { FSMEventService } from '../services/fsm-event.service';

const TERMINAL_STATES = new Set(['IDLE', 'CLOSED', 'QUOTE_ACTIVE']);
const ABANDONMENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * FF-BE-009 — Detecção de abandono de funil.
 *
 * Conversas em estado intermediário (não-IDLE/CLOSED) que não tiveram
 * mensagem do produtor por mais de 24h são marcadas como abandonadas.
 * Registra um evento quote_abandoned em FSMEvent para alimentar o
 * dashboard /reports e os KPIs do FEAT-007.
 *
 * Idempotência: usa um marcador no payload (lastSignaledAt) para não
 * disparar múltiplos eventos para a mesma sessão. O marcador é armazenado
 * em um campo extra do FSMEvent gerado, e o filtro do próximo run busca
 * apenas conversationStates SEM evento quote_abandoned recente.
 */
export function startDetectAbandonedQuotesJob(): void {
  // 03:00 BRT diariamente
  cron.schedule('0 3 * * *', async () => {
    await runOnce().catch((err) => {
      logger.error('detect-abandoned-quotes job failed', { error: err });
    });
  });

  logger.info('detect-abandoned-quotes job scheduled (daily, 03:00 BRT)');
}

/**
 * Implementação extraída em função separada para permitir teste unitário
 * e execução manual via script.
 */
export async function runOnce(): Promise<{ scanned: number; signaled: number }> {
  const cutoff = new Date(Date.now() - ABANDONMENT_THRESHOLD_MS);

  const stale = await prisma.conversationState.findMany({
    where: {
      updatedAt: { lt: cutoff },
      step: { notIn: Array.from(TERMINAL_STATES) },
    },
    select: { producerId: true, step: true, updatedAt: true },
  });

  let signaled = 0;

  for (const conv of stale) {
    // Verifica se já existe um quote_abandoned recente (após o updatedAt)
    // para esse produtor — evita duplicar eventos.
    const recent = await prisma.fSMEvent.findFirst({
      where: {
        producerId: conv.producerId,
        eventType: 'quote_abandoned',
        timestamp: { gt: conv.updatedAt },
      },
      select: { id: true },
    });

    if (recent) continue;

    await FSMEventService.track({
      producerId: conv.producerId,
      eventType: 'quote_abandoned',
      fromState: conv.step,
      payload: {
        lastUpdatedAt: conv.updatedAt.toISOString(),
        idleHours: Math.round((Date.now() - conv.updatedAt.getTime()) / 3_600_000),
      },
    });
    signaled++;
  }

  logger.info('detect-abandoned-quotes job completed', {
    scanned: stale.length,
    signaled,
  });

  return { scanned: stale.length, signaled };
}
