import { ConversationContext } from '../types';
import { similarity } from './fuzzy-match.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * FF-BE-017b — Edição inline AVANÇADA pós-resumo do smart fill.
 *
 * Comandos suportados:
 *   - "tira o Pedro"          → fuzzy match em selectedSuppliers, remove
 *   - "remove o Pedro"
 *   - "exclui Pedro"
 *   - "tira o Pedro e o João" → multi-remove
 *   - "só meus 3 maiores"     → ranking por totalProposals (proxy de volume)
 *   - "top 5 maiores"
 *
 * Aceita-se apenas quando smart fill já está ativo e há
 * selectedSuppliers no contexto. Remoções aplicam fuzzy ≥ 0.7 — abaixo
 * disso, sugere-se "Você quis dizer X?" (caller decide).
 *
 * Nota: a query de "top N maiores" usa `totalProposals` como proxy de
 * volume (campo já existe). Pré-cálculo via materialized view ficaria
 * para uma futura otimização (grooming previu, fora do SP atual).
 */

const FUZZY_REMOVE_THRESHOLD = 0.7;

export type AdvancedEditKind = 'remove_supplier' | 'top_n_suppliers';

export interface AdvancedEditMatchedRemoveSupplier {
  kind: 'remove_supplier';
  rawInput: string;
  /** Nomes de fornecedores (texto) que o produtor quer remover. */
  targets: string[];
}

export interface AdvancedEditMatchedTopN {
  kind: 'top_n_suppliers';
  rawInput: string;
  n: number;
}

export type AdvancedEditMatched =
  | AdvancedEditMatchedRemoveSupplier
  | AdvancedEditMatchedTopN;

/**
 * Identifica o tipo de edição. Retorna null quando nenhuma regra casa.
 * Normaliza acentos para evitar variação Unicode (NFC/NFD).
 */
export function parseAdvancedEdit(message: string): AdvancedEditMatched | null {
  const raw = message.trim();
  if (!raw) return null;
  const normalized = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  // Top N — variantes: "top 5 maiores", "5 maiores", "so meus 3 maiores",
  // "apenas os 3 maiores", "top 10"
  const topMatch =
    normalized.match(/^(?:so\s+meus?\s+|apenas(?:\s+os)?\s+|top\s+)?(\d+)\s+maior(?:es)?$/) ||
    normalized.match(/^(?:apenas\s+(?:os\s+)?)?top\s+(\d+)$/);
  if (topMatch) {
    const n = parseInt(topMatch[1], 10);
    if (n > 0 && n <= 100) {
      return { kind: 'top_n_suppliers', rawInput: raw, n };
    }
  }

  // Remove — "tira o Pedro", "remove o Pedro e o João", "exclui Maria"
  // Aplicado sobre a string ORIGINAL para preservar capitalização do
  // nome alvo, mas o gatilho é detectado via normalized.
  const removeStartMatch = normalized.match(
    /^(?:tira(?:r)?|remove(?:r)?|exclui(?:r)?|sem)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/,
  );
  if (removeStartMatch) {
    // Recupera o "tail" no input original respeitando a posição
    const matchInRaw = raw.match(
      /^(?:tira(?:r)?|remove(?:r)?|exclui(?:r)?|sem)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/i,
    );
    const tail = matchInRaw ? matchInRaw[1] : removeStartMatch[1];
    // Splita em múltiplos quando "X e Y", "X, Y", "X e o Y"
    const targets = tail
      .split(/\s*(?:,| e (?:o |a )?)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (targets.length > 0) {
      return { kind: 'remove_supplier', rawInput: raw, targets };
    }
  }

  return null;
}

interface SelectedSupplier {
  id: string;
  name: string;
  phone: string;
}

export interface ApplyAdvancedEditResult {
  context: ConversationContext;
  /** Nomes que foram efetivamente removidos. */
  removed: string[];
  /** Termos que não casaram com nenhum fornecedor selecionado. */
  notFound: string[];
  /** Lista atualizada para exibir no resumo. */
  selectedAfter: SelectedSupplier[];
}

/**
 * Remove fornecedores por nome com fuzzy match (Levenshtein
 * normalizado). Threshold 0.7 — abaixo disso, retorna em notFound.
 */
export function applyRemoveSupplier(
  context: ConversationContext,
  targets: string[],
): ApplyAdvancedEditResult {
  const selected = (context.selectedSuppliers ?? []) as SelectedSupplier[];
  if (selected.length === 0 || targets.length === 0) {
    return { context, removed: [], notFound: targets, selectedAfter: selected };
  }

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  const removed: string[] = [];
  const notFound: string[] = [];
  let pool = [...selected];

  for (const target of targets) {
    const normTarget = normalize(target);
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < pool.length; i++) {
      const normName = normalize(pool[i].name);
      // Substring/token match — quando "pedro" está em "Pedro Silva"
      // queremos peso ≥ threshold sem precisar de Levenshtein.
      let score = 0;
      if (normName === normTarget) {
        score = 1;
      } else if (
        normName.split(/\s+/).includes(normTarget) ||
        normName.split(/\s+/).some((tok) => similarity(tok, normTarget) >= 0.85)
      ) {
        score = 0.95;
      } else if (normName.includes(normTarget) && normTarget.length >= 3) {
        score = 0.85;
      } else {
        score = similarity(normTarget, normName);
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= FUZZY_REMOVE_THRESHOLD) {
      removed.push(pool[bestIdx].name);
      pool = pool.filter((_, i) => i !== bestIdx);
    } else {
      notFound.push(target);
    }
  }

  return {
    context: { ...context, selectedSuppliers: pool },
    removed,
    notFound,
    selectedAfter: pool,
  };
}

/**
 * Filtra para os top N fornecedores em "volume" (totalProposals desc,
 * acceptedProposals desc, name asc para empate). Mantém apenas eles
 * em context.selectedSuppliers.
 */
export async function applyTopNSuppliers(
  context: ConversationContext,
  n: number,
): Promise<ApplyAdvancedEditResult> {
  const selected = (context.selectedSuppliers ?? []) as SelectedSupplier[];
  if (selected.length === 0 || n <= 0) {
    return { context, removed: [], notFound: [], selectedAfter: selected };
  }

  if (n >= selected.length) {
    return { context, removed: [], notFound: [], selectedAfter: selected };
  }

  try {
    const ranked = await prisma.supplier.findMany({
      where: { id: { in: selected.map((s) => s.id) } },
      select: {
        id: true,
        name: true,
        phone: true,
        totalProposals: true,
        acceptedProposals: true,
      },
      orderBy: [
        { totalProposals: 'desc' },
        { acceptedProposals: 'desc' },
        { name: 'asc' },
      ],
    });

    const top = ranked.slice(0, n).map((s) => ({ id: s.id, name: s.name, phone: s.phone }));
    const removed = selected
      .filter((s) => !top.some((t) => t.id === s.id))
      .map((s) => s.name);

    return {
      context: { ...context, selectedSuppliers: top },
      removed,
      notFound: [],
      selectedAfter: top,
    };
  } catch (err) {
    logger.warn('applyTopNSuppliers failed', { err });
    return { context, removed: [], notFound: [], selectedAfter: selected };
  }
}
