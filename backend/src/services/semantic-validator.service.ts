import path from 'path';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger';
import { NLUExtraction } from './nlu-types';

/**
 * FF-BE-012 — Validação semântica pós-NLU.
 *
 * Aplicada depois do extractor multi-slot (FF-BE-010) para detectar:
 *   - Quantidade fora de range plausível por categoria.
 *   - Data inválida ou no passado.
 *   - Região inexistente no Brasil.
 *   - Produto incompatível com a categoria.
 *
 * Cada falha vira um item em `issues[]` consumido pelo smart-fill
 * handler (FF-BE-013) para decidir como apresentar no resumo:
 *   - severity 'warn': mostra ⚠️ no resumo, pede confirmação.
 *   - severity 'error': descarta o campo, força nova pergunta.
 *
 * Ranges por categoria entregues pelo PO em 08/05/2026.
 */

export interface ValidationIssue {
  field: keyof NLUExtraction['fields'];
  reason:
    | 'qty_above_max'
    | 'qty_below_min'
    | 'date_invalid'
    | 'date_in_past'
    | 'region_unknown'
    | 'product_category_mismatch';
  severity: 'warn' | 'error';
  message: string;
  value?: unknown;
}

export interface ValidatedExtraction {
  extraction: NLUExtraction;
  issues: ValidationIssue[];
}

interface QuantityRange {
  min: number;
  max: number;
  baseUnit: string;
}

const QUANTITY_RANGES: Record<string, QuantityRange> = {
  Fertilizante: { min: 0.5, max: 10_000, baseUnit: 'Ton' },
  Defensivo: { min: 1, max: 50_000, baseUnit: 'litros' },
  Semente: { min: 1, max: 5_000, baseUnit: 'sacas' },
  Foliar: { min: 1, max: 20_000, baseUnit: 'litros' },
  Ração: { min: 100, max: 500_000, baseUnit: 'kg' },
  Combustível: { min: 100, max: 200_000, baseUnit: 'litros' },
};

interface CityIndex {
  byNorm: Map<string, Array<{ name: string; uf: string }>>;
}

let cityIndexCache: CityIndex | null = null;

function strip(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Remove sufixo " - UF" / "/UF" / ",UF" / " UF" (sigla 2 letras) do
 * input antes da busca no índice IBGE. Sem isso, "Rio Verde/GO" não
 * casa com a chave "rio verde" do índice.
 */
function stripUFSuffix(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/^(.+?)\s*[-/,]\s*[A-Za-z]{2}\s*$/);
  if (m) return m[1].trim();
  const m2 = trimmed.match(/^(.+?)\s+[A-Z]{2}\s*$/);
  if (m2) return m2[1].trim();
  return trimmed;
}

function loadCityIndex(): CityIndex {
  if (cityIndexCache) return cityIndexCache;

  const filePath = path.join(__dirname, '..', '..', 'data', 'ibge-municipios.json');
  let raw: any[];
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.error('Failed to load IBGE municipios JSON', { err, filePath });
    cityIndexCache = { byNorm: new Map() };
    return cityIndexCache;
  }

  const byNorm = new Map<string, Array<{ name: string; uf: string }>>();
  for (const entry of raw) {
    const name = entry?.nome;
    const uf = entry?.microrregiao?.mesorregiao?.UF?.sigla;
    if (!name || !uf) continue;
    const key = strip(name);
    const list = byNorm.get(key) ?? [];
    list.push({ name, uf });
    byNorm.set(key, list);
  }

  cityIndexCache = { byNorm };
  logger.info('IBGE city index loaded', { cities: byNorm.size });
  return cityIndexCache;
}

export class SemanticValidator {
  /**
   * Valida extração e devolve issues — não muta extraction.
   */
  static validate(extraction: NLUExtraction, options?: { now?: Date }): ValidatedExtraction {
    const issues: ValidationIssue[] = [];
    const now = options?.now ?? new Date();

    const f = extraction.fields;

    // ── Quantity vs categoria ───────────────────────────────────────
    if (f.quantity && f.category) {
      const range = QUANTITY_RANGES[f.category.value];
      if (range) {
        const qty = f.quantity.value;
        if (qty > range.max) {
          issues.push({
            field: 'quantity',
            reason: 'qty_above_max',
            severity: 'warn',
            message: `Quantidade ${qty} ${f.quantity.unit} parece muito alta para ${f.category.value} (máx esperado ${range.max} ${range.baseUnit}). Confirma?`,
            value: qty,
          });
        } else if (qty < range.min) {
          issues.push({
            field: 'quantity',
            reason: 'qty_below_min',
            severity: 'error',
            message: `Quantidade ${qty} ${f.quantity.unit} é menor que o mínimo prático para ${f.category.value} (${range.min} ${range.baseUnit}).`,
            value: qty,
          });
        }
      }
    }

    // ── Deadline: data válida e futura ──────────────────────────────
    if (f.deadline) {
      const parsed = parseDate(f.deadline.value, now);
      if (!parsed) {
        issues.push({
          field: 'deadline',
          reason: 'date_invalid',
          severity: 'error',
          message: `Prazo "${f.deadline.value}" não é uma data válida.`,
          value: f.deadline.value,
        });
      } else if (parsed.getTime() < startOfDay(now).getTime()) {
        issues.push({
          field: 'deadline',
          reason: 'date_in_past',
          severity: 'error',
          message: `Prazo ${f.deadline.value} está no passado.`,
          value: f.deadline.value,
        });
      }
    }

    // ── Região: existe na base IBGE? ────────────────────────────────
    if (f.region) {
      const idx = loadCityIndex();
      // Extrai cidade do formato "Cidade - UF" / "Cidade/UF" / "Cidade,UF"
      const cityOnly = stripUFSuffix(f.region.value);
      const key = strip(cityOnly);
      const matches = idx.byNorm.get(key);
      if (!matches || matches.length === 0) {
        issues.push({
          field: 'region',
          reason: 'region_unknown',
          severity: 'warn',
          message: `Região "${f.region.value}" não foi encontrada na base do IBGE. Confirma o nome?`,
          value: f.region.value,
        });
      }
      // Disambiguation (>1 UF) é tratada pelo FF-BE-018; aqui só
      // anotamos via NLU.region.needsDisambiguation se aplicável.
    }

    // ── Produto vs categoria — ambos vêm do NLU ─────────────────────
    if (f.product && f.category) {
      const incompat = isProductCategoryIncompatible(f.product.value, f.category.value);
      if (incompat) {
        issues.push({
          field: 'product',
          reason: 'product_category_mismatch',
          severity: 'warn',
          message: `O produto "${f.product.value}" não parece ser ${f.category.value.toLowerCase()}. Confirma?`,
          value: f.product.value,
        });
      }
    }

    return { extraction, issues };
  }

  /** Para testes — limpa cache do índice IBGE. */
  static _clearCache(): void {
    cityIndexCache = null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Aceita ISO YYYY-MM-DD, dd/mm, dd/mm/yyyy. Retorna null se inválida.
 */
function parseDate(input: string, now: Date): Date | null {
  if (!input) return null;
  const trimmed = input.trim();

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm[/yyyy]
  const m = trimmed.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Validação real do JS (rejeita 30/02 etc.)
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1 || d.getDate() !== day || d.getFullYear() !== year) {
      return null;
    }
    return d;
  }

  // Fuzzy ("amanhã", "em X dias") — não validamos como erro; retorna data razoável
  const lower = trimmed.toLowerCase();
  if (lower.includes('amanh')) {
    const d = startOfDay(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  const emDias = lower.match(/em\s+(\d+)\s*dias?/);
  if (emDias) {
    const d = startOfDay(now);
    d.setDate(d.getDate() + parseInt(emDias[1], 10));
    return d;
  }

  return null; // formato não reconhecido
}

/**
 * Heurística pequena para detectar combinações claramente incompatíveis.
 * Não tem ambição de ser exaustiva — confia no ProductCategoryService
 * (FF-BE-011) para inferência primária. Aqui pegamos contradições
 * óbvias: "soja" classificada como "Combustível", "diesel" classificado
 * como "Semente", etc.
 */
function isProductCategoryIncompatible(productValue: string, categoryValue: string): boolean {
  const p = strip(productValue);
  const c = strip(categoryValue);

  const rules: Array<{ keyword: RegExp; categories: string[] }> = [
    { keyword: /\b(soja|milho|sorgo|girassol|algodao|bmx|tmg|intacta)\b/, categories: ['semente'] },
    { keyword: /\b(npk|ureia|kcl|map|dap|ssp|tsp|adubo|fertilizante|calcario|gesso)\b/, categories: ['fertilizante'] },
    { keyword: /\b(roundup|glifosato|atrazina|herbicida|fungicida|inseticida|acaricida|2,?4-?d)\b/, categories: ['defensivo'] },
    { keyword: /\b(diesel|gasolina|etanol|s10|s500)\b/, categories: ['combustivel'] },
    { keyword: /\b(racao|farelo|premix|nucleo|torta de soja)\b/, categories: ['racao'] },
    { keyword: /\b(boro|zinco|manganes|micronutriente|foliar)\b/, categories: ['foliar'] },
  ];

  for (const r of rules) {
    if (r.keyword.test(p) && !r.categories.includes(c)) {
      return true;
    }
  }
  return false;
}
