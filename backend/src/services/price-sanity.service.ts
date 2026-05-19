import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * CO-3-05 — Sanity check de preço de proposta.
 *
 * Compara o preço unitário proposto contra a mediana das últimas 30 propostas
 * do MESMO material (matching por descrição/SKU) na MESMA região. Se desvio
 * for > 3x para cima ou > 3x para baixo, retorna `outlier` = true para que
 * a FSM peça confirmação ao fornecedor antes de aceitar.
 *
 * Sem histórico suficiente (< 5 amostras), retorna `outlier=false` por default
 * (não temos baseline confiável para alertar).
 */

const MIN_SAMPLES = 5;
const OUTLIER_MULTIPLIER = 3;
const HISTORY_WINDOW = 30;

export interface PriceSanityResult {
  outlier: boolean;
  unitPrice: number;
  median: number | null;
  samples: number;
  reason?: 'too_high' | 'too_low';
  pctDeviation?: number;
}

export class PriceSanityService {
  /**
   * Verifica se o preço informado é outlier dado o histórico.
   *
   * @param productKey  descrição livre ou SKU canônico do material
   * @param region      região da obra/quote (case-insensitive contains)
   * @param unit        unidade do preço (pra normalizar amostras)
   * @param unitPrice   preço unitário informado
   */
  static async check(
    productKey: string,
    region: string,
    unit: string,
    unitPrice: number,
  ): Promise<PriceSanityResult> {
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { outlier: false, unitPrice, median: null, samples: 0 };
    }

    // Busca últimas N propostas (via ProposalItem → quoteItem) onde:
    //   - quoteItem.product case-insensitive contém o material
    //   - quoteItem.unit mesma unidade
    //   - quote.region case-insensitive contém a região
    const samples = await prisma.proposalItem.findMany({
      where: {
        quoteItem: {
          product: { contains: productKey, mode: 'insensitive' },
          unit: { equals: unit, mode: 'insensitive' },
        },
        proposal: {
          quote: {
            region: { contains: region, mode: 'insensitive' },
          },
        },
      },
      orderBy: { proposal: { createdAt: 'desc' } },
      take: HISTORY_WINDOW,
      select: { unitPrice: true },
    });

    const prices = samples
      .map((s: any) => Number(s.unitPrice))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (prices.length < MIN_SAMPLES) {
      logger.debug('price_sanity.no_baseline', {
        productKey,
        region,
        unit,
        samples: prices.length,
      });
      return { outlier: false, unitPrice, median: null, samples: prices.length };
    }

    prices.sort((a, b) => a - b);
    const median =
      prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

    const ratio = unitPrice / median;
    if (ratio >= OUTLIER_MULTIPLIER) {
      const pctDeviation = Math.round((ratio - 1) * 100);
      logger.warn('price_sanity.outlier_high', {
        productKey,
        region,
        unit,
        unitPrice,
        median,
        pctDeviation,
      });
      return {
        outlier: true,
        unitPrice,
        median,
        samples: prices.length,
        reason: 'too_high',
        pctDeviation,
      };
    }
    if (ratio <= 1 / OUTLIER_MULTIPLIER) {
      const pctDeviation = Math.round((1 - ratio) * 100);
      logger.warn('price_sanity.outlier_low', {
        productKey,
        region,
        unit,
        unitPrice,
        median,
        pctDeviation,
      });
      return {
        outlier: true,
        unitPrice,
        median,
        samples: prices.length,
        reason: 'too_low',
        pctDeviation,
      };
    }

    return { outlier: false, unitPrice, median, samples: prices.length };
  }

  /**
   * Mensagem amigável a enviar via WhatsApp quando outlier detectado.
   */
  static formatConfirmation(result: PriceSanityResult, materialName: string): string {
    if (!result.outlier || result.median === null) return '';
    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    if (result.reason === 'too_high') {
      return (
        `⚠️ O preço de ${fmt(result.unitPrice)} para *${materialName}* está bem acima ` +
        `da mediana do mercado (~${fmt(result.median)}, baseado em ${result.samples} propostas). ` +
        `Confirma o valor?\n\n1 — Sim, preço correto\n2 — Não, vou corrigir`
      );
    }
    return (
      `⚠️ O preço de ${fmt(result.unitPrice)} para *${materialName}* está bem abaixo ` +
      `da mediana do mercado (~${fmt(result.median)}, baseado em ${result.samples} propostas). ` +
      `Confirma o valor?\n\n1 — Sim, preço correto\n2 — Não, vou corrigir`
    );
  }
}
