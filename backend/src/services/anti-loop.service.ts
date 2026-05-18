import { ConversationContext } from '../types';

/**
 * FF-BE-021 — Anti-loop e escape após N tentativas no mesmo campo.
 *
 * Decisão grooming: counter por campo armazenado no ConversationContext
 * (sem migration; o context já é JSON em ConversationState). Reset
 * automático ao trocar de campo.
 *
 * Threshold: 3 tentativas consecutivas pedindo o MESMO campo.
 * Excedeu → produzir mensagem de escape e oferecer cancelar/atendimento.
 */

const MAX_ATTEMPTS = 3;
const COUNTER_KEY = '_attemptsPerField';
const LAST_FIELD_KEY = '_lastAskedField';

export interface AntiLoopState {
  /** Mensagem de escape, ou null se ainda não atingiu o threshold. */
  escapeMessage: string | null;
  /** Contexto atualizado com counters bumpados. */
  context: ConversationContext;
  /** Contador atual do campo. */
  attempts: number;
}

/**
 * Registra que estamos pedindo `field` e devolve estado:
 *   - Se mudou de campo, reseta counter.
 *   - Se mesmo campo, incrementa.
 *   - Se atingiu MAX_ATTEMPTS, devolve escapeMessage.
 */
export function trackFieldAttempt(
  context: ConversationContext,
  field: string,
): AntiLoopState {
  const ctx = { ...context };
  const counters: Record<string, number> =
    ((ctx as any)[COUNTER_KEY] as Record<string, number>) ?? {};
  const lastField = (ctx as any)[LAST_FIELD_KEY] as string | undefined;

  let nextCounters: Record<string, number>;
  if (lastField && lastField !== field) {
    // Trocou de campo — zera todos
    nextCounters = { [field]: 1 };
  } else {
    nextCounters = { ...counters, [field]: (counters[field] ?? 0) + 1 };
  }

  (ctx as any)[COUNTER_KEY] = nextCounters;
  (ctx as any)[LAST_FIELD_KEY] = field;

  const attempts = nextCounters[field] ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    return {
      escapeMessage: buildEscapeMessage(field),
      context: ctx,
      attempts,
    };
  }

  return { escapeMessage: null, context: ctx, attempts };
}

/**
 * Limpa contadores — chamado quando produtor sai do loop (sucesso,
 * cancelar, corrigir tudo).
 */
export function resetFieldAttempts(context: ConversationContext): ConversationContext {
  const ctx = { ...context };
  delete (ctx as any)[COUNTER_KEY];
  delete (ctx as any)[LAST_FIELD_KEY];
  return ctx;
}

function buildEscapeMessage(field: string): string {
  const labels: Record<string, string> = {
    product: 'produto',
    quantity: 'quantidade',
    region: 'região',
    deadline: 'prazo',
    freight: 'frete',
    payment: 'pagamento',
    category: 'categoria',
  };
  const label = labels[field] ?? field;
  return `Tô tendo dificuldade em entender o ${label}. 😔

Quer falar com nossa equipe ou prefere cancelar?

1 — Falar com a equipe
2 — Cancelar
ou tente digitar de novo`;
}
