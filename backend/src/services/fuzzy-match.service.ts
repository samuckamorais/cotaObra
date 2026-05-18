import path from 'path';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger';

/**
 * FF-BE-018 — Disambiguação + fuzzy matching.
 *
 * Estratégia (RN-14):
 *   - Score >= 0.90 → normaliza silenciosamente.
 *   - 0.70..0.89  → sugere "Você quis dizer X?".
 *   - < 0.70      → trata como desconhecido (caller decide).
 *
 * Aplicado a:
 *   - Cidades (IBGE — 5571 municípios). Disambiguação por UF quando
 *     o produtor já usou esse município antes (lastQuotePreferences).
 *   - Produtos: fuzzy contra keywords do ProductCategoryService (FF-BE-011)
 *     pode ser ligado depois — esta task entrega apenas o helper genérico.
 */

const HIGH_THRESHOLD = 0.9;
const MEDIUM_THRESHOLD = 0.7;

export type FuzzyVerdict =
  | { kind: 'silent'; value: string; score: number; meta?: Record<string, unknown> }
  | { kind: 'suggest'; value: string; score: number; meta?: Record<string, unknown> }
  | { kind: 'unknown' };

export interface FuzzyCandidate {
  /** Forma canônica que será emitida quando o match casar. */
  display: string;
  /** Forma normalizada (sem acento, lowercase) para cálculo. */
  normalized: string;
  /** Metadados arbitrários (ex: UF da cidade) anexados ao verdict. */
  meta?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────
// Distância de Levenshtein (DP iterativo, O(n*m))
// ────────────────────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,           // insert
        prev[j] + 1,               // delete
        prev[j - 1] + cost,        // replace
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Score 0..1: 1.0 = idêntico, 0.0 = totalmente diferente.
 * Usa Levenshtein normalizado pelo comprimento maior.
 */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

function strip(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrai UF (sigla 2 letras) do final de input quando presente no
 * formato "Cidade - UF", "Cidade/UF", "Cidade, UF" ou "Cidade UF".
 * Retorna { city, uf } com o UF normalizado em uppercase.
 */
export function parseRegionInput(input: string): { city: string; uf?: string } {
  const trimmed = input.trim();
  const m = trimmed.match(/^(.+?)\s*[-/,]\s*([A-Za-z]{2})\s*$/);
  if (m) {
    return { city: m[1].trim(), uf: m[2].toUpperCase() };
  }
  // Caso "Cidade UF" sem separador (apenas se UF for sigla maiúscula)
  const m2 = trimmed.match(/^(.+?)\s+([A-Z]{2})\s*$/);
  if (m2) {
    return { city: m2[1].trim(), uf: m2[2].toUpperCase() };
  }
  return { city: trimmed };
}

/**
 * Procura o melhor candidato em `candidates` para `input`. Aplica
 * thresholds RN-14. Retorna verdict null-safe.
 */
export function findFuzzyMatch(input: string, candidates: FuzzyCandidate[]): FuzzyVerdict {
  const target = strip(input);
  if (!target) return { kind: 'unknown' };

  let best: { c: FuzzyCandidate; score: number } | null = null;

  for (const c of candidates) {
    const score = similarity(target, c.normalized);
    if (!best || score > best.score) {
      best = { c, score };
    }
  }

  if (!best) return { kind: 'unknown' };
  if (best.score >= HIGH_THRESHOLD) {
    return { kind: 'silent', value: best.c.display, score: best.score, meta: best.c.meta };
  }
  if (best.score >= MEDIUM_THRESHOLD) {
    return { kind: 'suggest', value: best.c.display, score: best.score, meta: best.c.meta };
  }
  return { kind: 'unknown' };
}

// ────────────────────────────────────────────────────────────────────
// Catálogo de cidades IBGE — carrega 1x e indexa por nome
// ────────────────────────────────────────────────────────────────────

interface CityCandidate extends FuzzyCandidate {
  meta: { uf: string; ibgeId: number };
}

let cityCatalogCache: CityCandidate[] | null = null;

function loadCityCatalog(): CityCandidate[] {
  if (cityCatalogCache) return cityCatalogCache;
  const filePath = path.join(__dirname, '..', '..', 'data', 'ibge-municipios.json');
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as any[];
    cityCatalogCache = raw
      .map((entry) => {
        const name = entry?.nome;
        const uf = entry?.microrregiao?.mesorregiao?.UF?.sigla;
        const id = entry?.id;
        if (!name || !uf) return null;
        return {
          display: `${name} - ${uf}`,
          normalized: strip(name),
          meta: { uf, ibgeId: id },
        };
      })
      .filter((x): x is CityCandidate => x !== null);
    return cityCatalogCache;
  } catch (err) {
    logger.error('Failed to load IBGE catalog for fuzzy match', { err });
    cityCatalogCache = [];
    return cityCatalogCache;
  }
}

/**
 * Match fuzzy de cidade contra IBGE. Quando há múltiplos exatos
 * (ex: "Cruzeiro do Sul" em 3 UFs), aplica preferência por UF
 * informada em `preferUF` (vinda de lastQuotePreferences) ou parseada
 * do próprio input ("Rio Verde/GO" → city="Rio Verde", uf="GO").
 */
export function fuzzyMatchCity(input: string, preferUF?: string): FuzzyVerdict {
  const catalog = loadCityCatalog();
  // Extrai UF do input ANTES de normalizar — "Rio Verde/GO" vira
  // city="Rio Verde" + uf="GO". UF do input tem prioridade sobre preferUF.
  const parsed = parseRegionInput(input);
  const effectiveUF = parsed.uf ?? preferUF;
  const target = strip(parsed.city);
  if (!target) return { kind: 'unknown' };

  // 1) Match exato por nome normalizado — pode ter múltiplas UFs
  const exact = catalog.filter((c) => c.normalized === target);
  if (exact.length === 1) {
    return { kind: 'silent', value: exact[0].display, score: 1, meta: exact[0].meta };
  }
  if (exact.length > 1) {
    if (effectiveUF) {
      const match = exact.find((c) => c.meta.uf === effectiveUF.toUpperCase());
      if (match) {
        return { kind: 'silent', value: match.display, score: 1, meta: match.meta };
      }
    }
    // Múltiplos sem desempate — sugere o primeiro (alfabético por UF)
    const sorted = [...exact].sort((a, b) => a.meta.uf.localeCompare(b.meta.uf));
    return {
      kind: 'suggest',
      value: sorted[0].display,
      score: 1,
      meta: { ...sorted[0].meta, ambiguous: true, options: sorted.map((s) => s.display) },
    };
  }

  // 2) Fuzzy — usa só o nome da cidade, sem o UF
  return findFuzzyMatch(parsed.city, catalog);
}

/** Apenas para testes — limpa cache. */
export function _clearCityCatalogCache(): void {
  cityCatalogCache = null;
}
