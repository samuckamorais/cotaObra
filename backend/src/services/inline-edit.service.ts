import { ConversationContext } from '../types';
import { normalizeUnit } from '../utils/unit-normalizer';

/**
 * FF-BE-017a — Edição inline básica de campos do smart fill.
 *
 * Quando o produtor responde no AWAITING_SMART_CONFIRMATION com algo
 * como "frete FOB", "pagamento 30 dias" ou "80 ton" (em vez de "sim"
 * ou "corrigir tudo"), aplica a alteração APENAS no campo identificado
 * e mantém o resto do contexto. Evita o reset destrutivo do
 * "corrigir tudo" (FEAT-007 § 2.3 — péssima UX antes do refinamento).
 *
 * Suporta apenas campos atômicos (frete, pagamento, qty/unit, região,
 * prazo, produto). Comandos avançados ("tira o Pedro", "top 3 maiores")
 * ficam para FF-BE-017b (Sprint 2).
 */

export type InlineEditField =
  | 'freight'
  | 'payment'
  | 'quantity'
  | 'region'
  | 'deadline'
  | 'product';

export interface InlineEdit {
  field: InlineEditField;
  rawInput: string;
  apply(context: ConversationContext): ConversationContext;
}

/**
 * Tenta interpretar `message` como uma edição inline. Retorna null
 * quando não casa nenhum padrão — caller deve seguir para o pipeline
 * NLU completo.
 */
export function parseInlineEdit(message: string): InlineEdit | null {
  const raw = message.trim();
  if (!raw) return null;

  // Frete: "frete FOB", "trocar frete pra CIF", "FOB"
  const freight = matchFreight(raw);
  if (freight) {
    return {
      field: 'freight',
      rawInput: raw,
      apply: (ctx) => ({ ...ctx, freight }),
    };
  }

  // Pagamento: "pagamento à vista", "trocar pagamento pra 30 dias"
  const payment = matchPayment(raw);
  if (payment !== null) {
    return {
      field: 'payment',
      rawInput: raw,
      apply: (ctx) => ({ ...ctx, quotePaymentTerms: payment }),
    };
  }

  // Quantidade: "trocar pra 80 ton", "80 toneladas", "60 sacas"
  const quantity = matchQuantity(raw);
  if (quantity) {
    return {
      field: 'quantity',
      rawInput: raw,
      apply: (ctx) => {
        const items = ctx.items && ctx.items.length > 0 ? [...ctx.items] : [];
        if (items.length === 0) {
          items.push({ product: '', quantity: quantity.value, unit: quantity.unit });
        } else {
          items[0] = { ...items[0], quantity: quantity.value, unit: quantity.unit };
        }
        return { ...ctx, items };
      },
    };
  }

  // Região: "região Sorriso", "trocar pra Sorriso/MT", "cidade Rio Verde"
  const region = matchRegion(raw);
  if (region) {
    return {
      field: 'region',
      rawInput: raw,
      apply: (ctx) => ({ ...ctx, region }),
    };
  }

  // Prazo: "prazo 15/09", "trocar prazo pra 30/08/2026"
  const deadline = matchDeadline(raw);
  if (deadline) {
    return {
      field: 'deadline',
      rawInput: raw,
      apply: (ctx) => ({ ...ctx, deadline }),
    };
  }

  // Produto: "produto Soja BMX", "trocar produto pra Roundup"
  const product = matchProduct(raw);
  if (product) {
    return {
      field: 'product',
      rawInput: raw,
      apply: (ctx) => {
        const items = ctx.items && ctx.items.length > 0 ? [...ctx.items] : [];
        if (items.length === 0) {
          items.push({ product, quantity: 0, unit: 'sacas' });
        } else {
          items[0] = { ...items[0], product };
        }
        return { ...ctx, items };
      },
    };
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────
// Parsers individuais
// ────────────────────────────────────────────────────────────────────

function matchFreight(input: string): 'CIF' | 'FOB' | null {
  // "frete X", "trocar frete pra X", "X" puro
  const m =
    input.match(/^(?:trocar\s+)?frete(?:\s+pra)?\s+(cif|fob)$/i) ||
    input.match(/^(cif|fob)$/i);
  if (!m) return null;
  return m[1].toUpperCase() as 'CIF' | 'FOB';
}

function matchPayment(input: string): string | null {
  const m = input.match(/^(?:trocar\s+)?pagamento(?:\s+pra)?\s+(.+)$/i);
  if (m) return m[1].trim();
  return null;
}

function matchQuantity(input: string): { value: number; unit: string } | null {
  // "trocar pra 80 ton", "80 toneladas", "qtd 100 sacas", "quantidade 60 ton"
  const patterns = [
    /^(?:trocar(?:\s+pra)?|qtd|quantidade)\s+(\d+(?:[.,]\d+)?)\s*([a-zçãáéíóú\s]+)$/i,
    /^(\d+(?:[.,]\d+)?)\s*(big\s*bags?|bags?|sacas?|sacos?|kg|kgs|quilos?|ton(?:eladas?)?|litros?|lts?|l|unidades?|un|sc|caixas?|cx|km|kms|hectares?|ha)$/i,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) {
      const value = parseFloat(m[1].replace(',', '.'));
      const unit = normalizeUnit(m[2]);
      if (Number.isFinite(value) && value > 0) return { value, unit };
    }
  }
  return null;
}

function matchRegion(input: string): string | null {
  const m = input.match(/^(?:trocar\s+)?(?:regi[aã]o|cidade)(?:\s+pra)?\s+(.+)$/i);
  if (m) return m[1].trim();
  return null;
}

function matchDeadline(input: string): string | null {
  const m =
    input.match(/^(?:trocar\s+)?prazo(?:\s+pra)?\s+(.+)$/i) ||
    input.match(/^(?:entrega(?:r)?\s+(?:em|at[ée]))\s+(.+)$/i);
  if (m) return m[1].trim();
  return null;
}

function matchProduct(input: string): string | null {
  const m = input.match(/^(?:trocar\s+)?produto(?:\s+pra)?\s+(.+)$/i);
  if (m) return m[1].trim();
  return null;
}
