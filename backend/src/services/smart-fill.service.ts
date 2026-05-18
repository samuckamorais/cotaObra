import { ConversationContext } from '../types';
import { NLUExtraction } from './nlu-types';
import { ValidationIssue, ValidatedExtraction } from './semantic-validator.service';
import { Messages } from '../flows/messages';
import {
  SmartDefaultsService,
  LastQuotePreferences,
} from './smart-defaults.service';
import { SUPPLIER_CATEGORY_LABELS } from '../constants/supplier-categories';

/**
 * FF-BE-013 — Helpers do Smart Fill Handler.
 * Centraliza vocabulário regex (decisão grooming: regex para sim/ok/etc,
 * NLU só para edição inline FF-BE-017) e o builder do resumo unificado.
 */

// Vocabulário regex curado pelo PO em FEAT-007-Refinamento §4.2
export const RE_CONFIRM = /^(sim|s|ok|confirmo|confirmar|pode mandar|manda|envia|enviar|fechar|fecha|pode|isso|positivo|aceito|aprovo|tá|ta|beleza|blz|certo|correto)$/i;
export const RE_CORRECT_ALL = /^(corrigir tudo|recome[çc]ar|come[çc]ar de novo|do zero|reset|refazer|recome[çc]ar tudo|tudo de novo)$/i;
export const RE_CORRECT_GENERIC = /^(corrigir|errei|errado|t[áa] errado|t[áa] errada|deixa eu mudar|mudar)$/i;
export const RE_VIEW_SUPPLIERS = /^(fornecedores|lista|quais|ver fornecedores|ver lista|mostra)$/i;

// Templates curados — top-10 combinações pelo PO em §4.3.
// Chave: missing fields ordenadas alfabeticamente, separadas por +.
const GROUPED_EXAMPLES: Record<string, string> = {
  'deadline+quantity+region': '60 ton, Rio Verde, 30/08',
  'deadline+region': 'Rio Verde, 30/08',
  'deadline+freight+payment+region': 'Rio Verde, 30/08, CIF, à vista',
  'freight+payment': 'CIF, à vista',
  'deadline+quantity': '60 ton, 30/08',
  'quantity+region': '60 ton, Rio Verde',
  'freight+payment+region': 'Rio Verde, CIF, à vista',
  'deadline+freight+quantity+region': '60 ton, Rio Verde, 30/08, CIF',
  'quantity': '60 ton',
  'deadline': '30/08',
};

const FALLBACK_EXAMPLE = 'manda os dados que faltam separados por vírgula';

const FIELD_LABELS: Record<string, string> = {
  product: 'produto',
  quantity: 'quantidade',
  region: 'região',
  deadline: 'prazo',
  freight: 'frete',
  payment: 'pagamento',
  category: 'categoria',
};

// Templates de exemplo para campos isolados que viram pergunta agrupada
const SOLO_FIELD_EXAMPLES: Record<string, string> = {
  category: 'Semente, Fertilizante, Defensivo, Foliar, ...',
  product: 'BMX Olimpo, SSP 20%, Roundup',
  quantity: '60 ton, 40 bag, 100 sacas',
  region: 'Rio Verde/GO, Sorriso/MT',
  deadline: '30/08/2026, em 5 dias, amanhã',
  freight: 'CIF ou FOB',
  payment: 'à vista, 30 dias, safra',
};

export interface SmartFillState {
  /** Campos que entraram no contexto da cotação (vindos do NLU + defaults) */
  context: ConversationContext;
  /** Nome dos campos que ainda faltam ser preenchidos */
  missing: string[];
  /** Issues do validador semântico (FF-BE-012) */
  warnings: ValidationIssue[];
  /** Origem da extração (telemetria) */
  source: NLUExtraction['source'];
  /** Quantos campos vieram preenchidos */
  fieldsExtractedCount: number;
  /**
   * Campos que vieram de lastQuotePreferences em vez da mensagem atual.
   * Usado pelo buildSummary para mostrar "(padrão anterior)" — FF-BE-015.
   */
  defaulted: Array<keyof LastQuotePreferences>;
}

export class SmartFillService {
  /**
   * Constrói o ConversationContext a partir da extração + ValidationIssues.
   * Erros (severity='error') descartam o campo. Warnings deixam passar
   * mas viram avisos no resumo.
   *
   * Quando `prefs` é informado (lastQuotePreferences do produtor), os
   * campos NÃO preenchidos pelo NLU são completados via SmartDefaultsService
   * (FF-BE-015). Campos defaultados são marcados no resultado.
   */
  static buildContext(
    validated: ValidatedExtraction,
    base: ConversationContext = {},
    prefs: LastQuotePreferences | null = null,
  ): SmartFillState {
    const ctx: ConversationContext = { ...base, items: base.items ? [...base.items] : [] };
    const erroredFields = new Set(
      validated.issues.filter((i) => i.severity === 'error').map((i) => i.field as string),
    );

    const f = validated.extraction.fields;

    // Inicia a partir do item já existente para não perder qty/unit
    // ao receber só o produto numa mensagem subsequente (FF-BE-013 bugfix).
    const existingItem = ctx.items?.[0];
    let nextProduct = existingItem?.product ?? '';
    let nextQty = existingItem?.quantity ?? 0;
    let nextUnit = existingItem?.unit ?? 'sacas';

    if (f.product && !erroredFields.has('product')) {
      const productValue = f.product.value.trim();
      // Quando o NLU classifica como produto algo que é EXATAMENTE
      // o label de uma categoria canônica (ex: produtor digita só
      // "Semente"), reinterpreta como categoria. Evita o caso em que
      // o resumo fica "Produto: Semente" — confuso pra todo mundo.
      const canonicalCat = SUPPLIER_CATEGORY_LABELS.find(
        (c) => c.toLowerCase() === productValue.toLowerCase(),
      );
      if (canonicalCat && !ctx.category) {
        ctx.category = canonicalCat;
        // produto continua faltando — sistema vai pedir explicitamente
      } else {
        nextProduct = productValue;
      }
    }

    if (f.quantity && !erroredFields.has('quantity')) {
      nextQty = f.quantity.value;
      nextUnit = f.quantity.unit;
    }

    if (nextProduct || nextQty) {
      ctx.items = [{ product: nextProduct, quantity: nextQty, unit: nextUnit }];
    }

    if (f.region && !erroredFields.has('region')) {
      ctx.region = f.region.value;
    }
    if (f.deadline && !erroredFields.has('deadline')) {
      ctx.deadline = f.deadline.value;
    }
    if (f.freight && !erroredFields.has('freight')) {
      const v = f.freight.value.toUpperCase();
      if (v === 'CIF' || v === 'FOB') ctx.freight = v;
    }
    if (f.payment && !erroredFields.has('payment')) {
      ctx.quotePaymentTerms = f.payment.value;
    }
    if (f.category && !erroredFields.has('category')) {
      ctx.category = f.category.value;
    }

    // FF-BE-015 — aplicar defaults APÓS o NLU (RN-01: explícito > default)
    const { context: ctxWithDefaults, defaulted } = SmartDefaultsService.apply(ctx, prefs);

    const missing: string[] = [];
    // Quando produto E categoria estão vazios, pede categoria primeiro
    // (alimenta o filtro de fornecedores). Produto vem em seguida.
    if (!ctxWithDefaults.items?.[0]?.product && !ctxWithDefaults.category) {
      missing.push('category');
    } else if (!ctxWithDefaults.items?.[0]?.product) {
      missing.push('product');
    } else if (!ctxWithDefaults.items[0].quantity) {
      missing.push('quantity');
    }
    if (!ctxWithDefaults.region) missing.push('region');
    if (!ctxWithDefaults.deadline) missing.push('deadline');
    if (!ctxWithDefaults.freight) missing.push('freight');
    if (!ctxWithDefaults.quotePaymentTerms) missing.push('payment');

    return {
      context: ctxWithDefaults,
      missing,
      warnings: validated.issues.filter((i) => i.severity === 'warn'),
      source: validated.extraction.source,
      fieldsExtractedCount: Object.keys(validated.extraction.fields).length,
      defaulted,
    };
  }

  /**
   * Decide se o smart fill deve ativar — RN-02: precisa de 2+ campos
   * e de pelo menos um campo "core" (product OU quantity OU region).
   */
  static shouldActivate(validated: ValidatedExtraction): boolean {
    const f = validated.extraction.fields;
    const filled = Object.values(f).filter(Boolean).length;
    if (filled < 2) return false;
    return Boolean(f.product || f.quantity || f.region);
  }

  /**
   * Monta o resumo unificado pronto para WhatsApp. Retorna null se
   * houver missing fields obrigatórios — caller deve usar
   * buildGroupedQuestion() em vez disso.
   */
  static buildSummary(state: SmartFillState, suppliersCount?: number): string {
    if (state.missing.length > 0) {
      // chamado em fluxo errado — retorna a pergunta agrupada
      return this.buildGroupedQuestion(state.missing);
    }

    const ctx = state.context;
    const product = ctx.items?.[0]?.product;
    const quantity = ctx.items?.[0]?.quantity;
    const unit = ctx.items?.[0]?.unit;
    const productLine =
      product
        ? `${product}${quantity ? ` • ${quantity} ${unit ?? ''}` : ''}${ctx.category ? ` • ${ctx.category}` : ''}`.trim()
        : undefined;

    const regionLine = ctx.region
      ? `${ctx.region}${ctx.deadline ? ` • prazo ${ctx.deadline}` : ''}`
      : undefined;

    const commercialLine =
      ctx.freight || ctx.quotePaymentTerms
        ? [ctx.freight, ctx.quotePaymentTerms].filter(Boolean).join(' • ')
        : undefined;

    const suppliersLine =
      suppliersCount !== undefined
        ? `${suppliersCount} fornecedor${suppliersCount === 1 ? '' : 'es'}`
        : undefined;

    const warnings = state.warnings.map((w) => w.message);

    // FF-BE-015 — descreve quais campos vieram de lastQuotePreferences
    let defaultsLine: string | undefined;
    if (state.defaulted.length > 0) {
      const labels: Record<string, string> = {
        freight: 'frete',
        paymentTerms: 'pagamento',
        region: 'região',
      };
      const items = state.defaulted.map((k) => labels[k] ?? k);
      defaultsLine = `${items.join(' e ')}: padrão anterior`;
    }

    return Messages.SMART_FILL_SUMMARY({
      productLine,
      regionLine,
      commercialLine,
      suppliersLine,
      warnings,
      defaultsLine,
    });
  }

  /**
   * Pergunta agrupada quando faltam 2+ campos. Usa templates curados.
   * Quando há apenas 1 campo faltante, usa um exemplo focado para
   * o campo (ex: categoria → "Semente, Fertilizante, ...").
   */
  static buildGroupedQuestion(missing: string[]): string {
    const labels = missing.map((f) => FIELD_LABELS[f] ?? f);
    if (missing.length === 1) {
      const example = SOLO_FIELD_EXAMPLES[missing[0]] ?? FALLBACK_EXAMPLE;
      return Messages.SMART_FILL_GROUPED_QUESTION({ missingLabels: labels, example });
    }
    const key = [...missing].sort().join('+');
    const example = GROUPED_EXAMPLES[key] ?? FALLBACK_EXAMPLE;
    return Messages.SMART_FILL_GROUPED_QUESTION({ missingLabels: labels, example });
  }
}
