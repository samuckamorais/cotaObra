import { Prisma } from '@prisma/client';

/**
 * CO-4-01 — Pricing Engine (pure function).
 *
 * Decisão de produto CENTRAL do CotaObra vs CotaAgro: ao comparar propostas
 * de fornecedores, não basta menor preço bruto. Precisamos corrigir por:
 *   1. Frete real (CIF vs FOB)
 *   2. Custo financeiro do parcelamento (à vista vs 28/56dd vs 30/60/90dd)
 *   3. Penalidade por atraso vs prazo desejado pela construtora
 *
 * Fórmula (pure, sem side effect):
 *   base = sum(proposalItems.totalPrice where available=true)
 *   freight = (freightMode === 'CIF') ? 0 : freightValue ?? 0
 *     // CIF: frete embutido no preço; FOB: comprador paga separado.
 *   financialCost = base * monthlyRate * weightedDays(paymentTerms) / 30
 *   deliveryAdjustment = max(0, deliveryDays - deadlineDays) * dailyPenalty * base
 *   corrected = base + freight + financialCost + deliveryAdjustment
 *
 * Mantém precisão decimal usando Prisma.Decimal (não Float).
 * Cobertura alvo: 100%. Sem dependência externa além do Prisma runtime.
 *
 * Ref: ARQUITETURA_E_ESPECIFICACAO_TECNICA.md §10.
 */

const { Decimal } = Prisma;

/** Modalidades de pagamento reconhecidas (cf. CO-3-03 supplier.flow). */
export type PaymentTermsCanonical =
  | 'à vista'
  | '28dd'
  | '28/56dd'
  | '30/60/90dd'
  | string; // texto livre é aceito; weightedDays cai para fallback

export interface PricingItem {
  totalPrice: number | string | Prisma.Decimal;
  available?: boolean;
}

export interface PricingProposalInput {
  items: PricingItem[];
  freightMode?: 'CIF' | 'FOB' | string | null;
  freightValue?: number | string | Prisma.Decimal | null;
  paymentTerms?: string | null;
  deliveryDays?: number | null;
}

export interface PricingQuoteInput {
  /** Dias de prazo desejado pela construtora (calculado a partir de quote.deadline) */
  deadlineDays: number;
}

export interface PricingSettings {
  /** Taxa mensal de custo financeiro (default 1% = 0.01) */
  monthlyRate: number;
  /** Penalidade diária por atraso (default 0.5% = 0.005) */
  dailyPenalty: number;
}

export interface PricingBreakdown {
  base: string;
  freight: string;
  financialCost: string;
  deliveryAdjustment: string;
  corrected: string;
}

export interface PricingResult {
  corrected: Prisma.Decimal;
  breakdown: PricingBreakdown;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  monthlyRate: 0.01,
  dailyPenalty: 0.005,
};

/**
 * Converte modalidade de pagamento em dias médios ponderados.
 *
 *   à vista        →  0  dias
 *   28dd           → 28  dias
 *   28/56dd        → 42  dias  (média ponderada 50/50)
 *   30/60/90dd     → 60  dias  (média ponderada 33/33/33)
 *
 * Fallback: tenta parsear "N dias" / "Ndd" como N dias. Texto livre
 * desconhecido vira 30 dias (suposição razoável de 1 mês).
 */
export function weightedDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms) return 0;
  const normalized = paymentTerms.toLowerCase().trim().replace(/\s/g, '');

  if (
    normalized === 'avista' ||
    normalized === 'àvista' ||
    normalized.includes('avista') ||
    normalized.includes('àvista') ||
    normalized.includes('avista')
  ) {
    return 0;
  }

  if (normalized === '28dd' || normalized === '28dias') return 28;
  if (normalized === '28/56dd' || normalized === '28/56') return 42;
  if (normalized === '30/60/90dd' || normalized === '30/60/90') return 60;

  // Parsing genérico "Ndd" ou "N dias"
  const nMatch = normalized.match(/^(\d+)(?:dd|dias?)?$/);
  if (nMatch) {
    const n = parseInt(nMatch[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 365) return n;
  }

  // Modalidades parceladas "A/B/Cdd"
  const splitMatch = normalized.match(/^(\d+(?:\/\d+)+)(?:dd)?$/);
  if (splitMatch) {
    const parts = splitMatch[1].split('/').map((p) => parseInt(p, 10));
    if (parts.every((p) => Number.isFinite(p) && p >= 0)) {
      return parts.reduce((sum, n) => sum + n, 0) / parts.length;
    }
  }

  // Fallback: 30 dias (1 mês padrão)
  return 30;
}

function toDecimal(v: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  if (typeof v === 'number' && (!Number.isFinite(v) || Number.isNaN(v))) {
    return new Decimal(0);
  }
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Calcula `correctedTotal` e o `breakdown` para uma proposta.
 *
 * @param proposal  proposta com items, frete, pagamento, prazo
 * @param quote     contém deadlineDays (dias entre createdAt e deadline)
 * @param settings  taxa mensal + penalidade diária (default DEFAULT_PRICING_SETTINGS)
 * @returns         { corrected: Decimal, breakdown: { base, freight, financialCost, deliveryAdjustment, corrected } }
 */
export function computeCorrectedTotal(
  proposal: PricingProposalInput,
  quote: PricingQuoteInput,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): PricingResult {
  // 1) Base: soma de items available
  const base = (proposal.items ?? [])
    .filter((it) => it.available !== false)
    .reduce<Prisma.Decimal>((acc, it) => acc.plus(toDecimal(it.totalPrice)), new Decimal(0));

  // 2) Frete: 0 se CIF (já no preço), valor declarado se FOB
  const freight =
    proposal.freightMode === 'CIF'
      ? new Decimal(0)
      : toDecimal(proposal.freightValue);

  // 3) Custo financeiro: base * monthlyRate * weightedDays / 30
  const wDays = weightedDays(proposal.paymentTerms);
  const financialCost = base
    .mul(new Decimal(settings.monthlyRate))
    .mul(new Decimal(wDays))
    .div(new Decimal(30));

  // 4) Ajuste de prazo: max(0, deliveryDays - deadlineDays) * dailyPenalty * base
  const overrun = Math.max(0, (proposal.deliveryDays ?? 0) - quote.deadlineDays);
  const deliveryAdjustment = base
    .mul(new Decimal(settings.dailyPenalty))
    .mul(new Decimal(overrun));

  const corrected = base.plus(freight).plus(financialCost).plus(deliveryAdjustment);

  return {
    corrected,
    breakdown: {
      base: base.toFixed(2),
      freight: freight.toFixed(2),
      financialCost: financialCost.toFixed(2),
      deliveryAdjustment: deliveryAdjustment.toFixed(2),
      corrected: corrected.toFixed(2),
    },
  };
}

/**
 * Computa correctedTotal para um array de propostas e atribui rank
 * (1 = menor corrected, vencedor).
 */
export function rankProposals<T extends PricingProposalInput>(
  proposals: T[],
  quote: PricingQuoteInput,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): Array<T & { corrected: Prisma.Decimal; breakdown: PricingBreakdown; rank: number }> {
  const scored = proposals.map((p) => ({
    ...p,
    ...computeCorrectedTotal(p, quote, settings),
  }));
  scored.sort((a, b) => {
    const diff = a.corrected.minus(b.corrected);
    if (diff.isNegative()) return -1;
    if (diff.isPositive()) return 1;
    return 0;
  });
  return scored.map((p, idx) => ({ ...p, rank: idx + 1 }));
}
