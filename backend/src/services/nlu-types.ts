/**
 * FF-BE-010 — Tipos da extração multi-slot com confiança.
 *
 * Cada campo extraído carrega seu próprio score (0..1). Os thresholds
 * são consumidos pelo smart-fill handler (FF-BE-013):
 *   - alta   (>= 0.85): pré-confirma silenciosamente (✅)
 *   - média  (0.50..0.85): mostra com aviso (⚠️) e permite override
 *   - baixa  (< 0.50): descarta extração e pergunta o campo
 */

export type NLUFieldUnit = 'Ton' | 'kg' | 'litros' | 'sacas' | 'Big Bags' | 'Unidades' | 'Caixas' | 'km' | 'ha' | string;

export interface NLUStringField {
  value: string;
  confidence: number;
}

export interface NLUQuantityField {
  value: number;
  unit: NLUFieldUnit;
  confidence: number;
}

export interface NLURegionField extends NLUStringField {
  /**
   * Marcado como true quando o nome do município existe em mais de
   * uma UF (ex: "Rio Verde" — GO, MT, RJ, ...). Disambiguação fica
   * a cargo do FF-BE-018.
   */
  needsDisambiguation?: boolean;
}

export interface NLUExtraction {
  fields: {
    product?: NLUStringField;
    quantity?: NLUQuantityField;
    region?: NLURegionField;
    deadline?: NLUStringField;     // ISO ou string normalizada
    freight?: NLUStringField;      // 'CIF' | 'FOB'
    payment?: NLUStringField;
    category?: NLUStringField;
    observation?: NLUStringField;
  };
  rawMessage: string;
  extractedAt: Date;
  modelVersion: string;
  source: 'openai' | 'regex' | 'cache';
}

/**
 * Conta quantos campos têm valor extraído. Usado pelo smart-fill para
 * decidir se ativa o fluxo (>= 2 campos) ou cai no sequencial (RN-02).
 */
export function countExtractedFields(extraction: NLUExtraction): number {
  return Object.values(extraction.fields).filter((f) => f !== undefined).length;
}

/**
 * Filtra campos por nível de confiança.
 */
export const NLU_CONFIDENCE_HIGH = 0.85;
export const NLU_CONFIDENCE_LOW = 0.5;

export type NLUFieldName = keyof NLUExtraction['fields'];

export function classifyConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= NLU_CONFIDENCE_HIGH) return 'high';
  if (score >= NLU_CONFIDENCE_LOW) return 'medium';
  return 'low';
}
