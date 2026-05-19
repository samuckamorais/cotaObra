import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { createError } from '../utils/error-handler';
import type { Supplier } from '@prisma/client';

/**
 * CO-3-01 — Sugestão automática de fornecedores para uma cotação.
 *
 * Ranqueia fornecedores do tenant (e da rede, opcionalmente) por
 * adequação ao Site/items da Quote.
 *
 * Score breakdown (peso total = 100):
 *   - categoryMatchAll       50 pts  fornecedor cobre TODAS as categorias dos itens
 *   - categoryMatchPartial   20 pts  cobre pelo menos 1 categoria (não cumulativo com all)
 *   - regionMatch            30 pts  fornecedor atende a região da obra
 *   - rating                 15 pts  rating médio do supplier (0–5 → 0–15)
 *   - responseSpeed           5 pts  inverso da latência média de resposta nas últimas
 *                                    5 cotações (5 pts se < 2h; 0 pts se > 24h)
 *
 * Retorna até 8 sugestões ordenadas por score decrescente.
 */

export interface SuggestedSupplier {
  supplier: Supplier;
  score: number;
  breakdown: {
    categoryMatchAll: boolean;
    categoryMatchPartial: boolean;
    regionMatch: boolean;
    rating: number;
    responseSpeedScore: number;
  };
}

const MAX_RESULTS = 8;

export class SupplierSuggestionService {
  static async suggestForQuote(
    tenantId: string,
    quoteId: string,
  ): Promise<SuggestedSupplier[]> {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        items: true,
        site: true,
      },
    });

    if (!quote) {
      throw createError.notFound('Cotação não encontrada');
    }

    // Categorias requeridas: une a Quote.category com categorias dos items
    // (heurística — Quote.items vão ter materialId futuramente, daí ler
    // categoria do Material catalogado).
    const requiredCategories = new Set<string>();
    if (quote.category) requiredCategories.add(quote.category);
    // Em Sprint 3 inicial, items só têm `product` livre. Categoria do material
    // virá em Sprint 4+ via materialId. Por enquanto usamos quote.category global.

    const region = quote.site?.region ?? quote.region;

    // Busca todos os fornecedores ativos do tenant + rede
    const suppliers = await prisma.supplier.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (suppliers.length === 0) {
      return [];
    }

    // Calcula score de cada um
    const scored: SuggestedSupplier[] = [];
    for (const s of suppliers) {
      const breakdown = await this.computeBreakdown(s, requiredCategories, region);
      const score =
        (breakdown.categoryMatchAll ? 50 : 0) +
        (breakdown.categoryMatchPartial && !breakdown.categoryMatchAll ? 20 : 0) +
        (breakdown.regionMatch ? 30 : 0) +
        breakdown.rating +
        breakdown.responseSpeedScore;

      // Filtra fornecedores sem nenhum match (score 0 inútil)
      if (score > 0) {
        scored.push({ supplier: s, score, breakdown });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    logger.info('supplier_suggestion.computed', {
      quoteId,
      tenantId,
      totalCandidates: suppliers.length,
      suggested: Math.min(scored.length, MAX_RESULTS),
    });

    return scored.slice(0, MAX_RESULTS);
  }

  private static async computeBreakdown(
    supplier: Supplier,
    requiredCategories: Set<string>,
    region: string,
  ): Promise<SuggestedSupplier['breakdown']> {
    // Match de categoria
    let categoryMatchAll = false;
    let categoryMatchPartial = false;
    if (requiredCategories.size > 0) {
      const supplierCats = new Set(supplier.categories);
      const matches = Array.from(requiredCategories).filter((c) =>
        supplierCats.has(c),
      );
      categoryMatchAll = matches.length === requiredCategories.size;
      categoryMatchPartial = matches.length > 0;
    } else {
      // Sem categoria definida na quote → considera partial match para todos
      categoryMatchPartial = true;
    }

    // Match de região (case-insensitive, contains)
    const regionNorm = (region ?? '').toLowerCase();
    const regionMatch =
      regionNorm.length > 0 &&
      supplier.regions.some((r) => r.toLowerCase().includes(regionNorm) || regionNorm.includes(r.toLowerCase()));

    // Rating: 0–5 → 0–15
    const rating = Math.min(15, Math.max(0, (supplier.rating ?? 0) * 3));

    // Response speed: média de tempo entre dispatch e proposal das últimas 5 cotações
    const responseSpeedScore = await this.responseSpeedScore(supplier.id);

    return {
      categoryMatchAll,
      categoryMatchPartial,
      regionMatch,
      rating,
      responseSpeedScore,
    };
  }

  /**
   * Pega últimas 5 propostas do fornecedor com timestamp.
   * Score 5 se mediana < 2h, 0 se > 24h, linear no meio.
   * 0 se não há histórico (assume neutro).
   */
  private static async responseSpeedScore(supplierId: string): Promise<number> {
    const recent = await prisma.proposal.findMany({
      where: { supplierId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        quote: { select: { createdAt: true } },
      },
    });

    if (recent.length === 0) return 0;

    const latencies = recent
      .map((p: any) => p.createdAt.getTime() - p.quote.createdAt.getTime())
      .filter((ms) => ms > 0);

    if (latencies.length === 0) return 0;

    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    const hours = median / (1000 * 60 * 60);

    // 5 pts se ≤ 2h, 0 pts se ≥ 24h, linear no meio
    if (hours <= 2) return 5;
    if (hours >= 24) return 0;
    return Math.max(0, 5 - ((hours - 2) / 22) * 5);
  }
}
