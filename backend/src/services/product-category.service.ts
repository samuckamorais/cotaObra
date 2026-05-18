import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { normalizeCategoryName } from '../utils/category-normalizer';

/**
 * FF-BE-011 — Mapeamento Produto → Categoria configurável.
 *
 * Decisões do grooming (08/05/2026):
 *  - Mapping global (não por tenant).
 *  - Cache em memória local com TTL 5 min.
 *  - Invalidação automática em write (add/remove/update).
 *
 * Estratégia de matching:
 *  1. Normaliza o texto de produto (lowercase + remove acentos).
 *  2. Procura todas as keywords do dicionário no texto, com word boundary.
 *  3. Retorna a categoria da keyword com maior comprimento (mais específica).
 *
 * Exemplos:
 *   "SSP 20%"          → Fertilizante
 *   "Roundup Original" → Defensivo
 *   "BMX Olimpo"       → Semente
 *   "Diesel S10"       → Combustível
 *   "Adubo verde"      → Fertilizante
 *   "Algo desconhecido" → null  (fallback: pergunta categoria)
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface MappingRow {
  id: string;
  keyword: string;
  category: string;
}

let cache: { rows: MappingRow[]; expiresAt: number } | null = null;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadMappings(): Promise<MappingRow[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rows;
  }
  const rows = await prisma.productCategoryMapping.findMany({
    select: { id: true, keyword: true, category: true },
  });
  cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

export class ProductCategoryService {
  /**
   * Infere a categoria a partir do texto livre do produto. Retorna o
   * label canônico ou `null` se nenhuma keyword for encontrada.
   *
   * Match preferindo keyword mais longa (ex: "torta de soja" > "soja").
   */
  static async infer(productText: string): Promise<string | null> {
    const normalized = normalize(productText);
    if (!normalized) return null;

    const rows = await loadMappings();
    if (rows.length === 0) return null;

    const sorted = [...rows].sort((a, b) => b.keyword.length - a.keyword.length);

    for (const m of sorted) {
      const kw = normalize(m.keyword);
      if (!kw) continue;
      const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
      if (re.test(normalized)) {
        return m.category;
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Admin CRUD
  // ──────────────────────────────────────────────────────────────────

  static async list(): Promise<MappingRow[]> {
    return loadMappings();
  }

  static async create(keyword: string, category: string): Promise<MappingRow> {
    const normKeyword = normalize(keyword);
    const normCategory = normalizeCategoryName(category);
    if (!normKeyword || normKeyword.length < 2) {
      throw new Error('Keyword inválida (mínimo 2 caracteres normalizados).');
    }
    if (!normCategory) {
      throw new Error('Categoria inválida.');
    }
    const created = await prisma.productCategoryMapping.create({
      data: { keyword: normKeyword, category: normCategory },
      select: { id: true, keyword: true, category: true },
    });
    invalidateCache();
    logger.info('ProductCategoryMapping created', { keyword: normKeyword });
    return created;
  }

  static async update(id: string, data: { keyword?: string; category?: string }): Promise<MappingRow> {
    const update: { keyword?: string; category?: string } = {};
    if (data.keyword !== undefined) {
      const normKeyword = normalize(data.keyword);
      if (!normKeyword || normKeyword.length < 2) {
        throw new Error('Keyword inválida (mínimo 2 caracteres normalizados).');
      }
      update.keyword = normKeyword;
    }
    if (data.category !== undefined) {
      const normCategory = normalizeCategoryName(data.category);
      if (!normCategory) {
        throw new Error('Categoria inválida.');
      }
      update.category = normCategory;
    }
    const updated = await prisma.productCategoryMapping.update({
      where: { id },
      data: update,
      select: { id: true, keyword: true, category: true },
    });
    invalidateCache();
    logger.info('ProductCategoryMapping updated', { id });
    return updated;
  }

  static async delete(id: string): Promise<void> {
    await prisma.productCategoryMapping.delete({ where: { id } });
    invalidateCache();
    logger.info('ProductCategoryMapping deleted', { id });
  }

  /** Apenas para testes — limpa cache. */
  static _clearCache(): void {
    invalidateCache();
  }
}

function invalidateCache(): void {
  cache = null;
}
