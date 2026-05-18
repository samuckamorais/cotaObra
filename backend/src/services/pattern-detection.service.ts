import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Serviço de detecção de padrões para inteligência preditiva
 * Analisa histórico de cotações e identifica comportamentos recorrentes
 */
export class PatternDetectionService {
  /**
   * Detecta se o produtor tem padrão de cotação recorrente
   */
  async detectQuotePattern(
    producerId: string
  ): Promise<{
    hasPattern: boolean;
    frequency?: 'weekly' | 'monthly' | 'biweekly';
    product?: string;
    averageQuantity?: string;
    averageUnit?: string;
    dayOfMonth?: number;
    dayOfWeek?: number;
    confidence: number;
  }> {
    try {
      // Buscar últimas 10 cotações do produtor nos últimos 90 dias
      const recentQuotes = await prisma.quote.findMany({
        where: {
          producerId,
          createdAt: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 dias atrás
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      if (recentQuotes.length < 3) {
        return { hasPattern: false, confidence: 0 };
      }

      // Analisar produto mais cotado
      const productCounts = new Map<string, number>();
      recentQuotes.forEach((quote) => {
        const product = quote.product ?? '';
        const count = productCounts.get(product) || 0;
        productCounts.set(product, count + 1);
      });

      const mostQuotedProduct = Array.from(productCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0];

      // Se não há um produto dominante (>= 60%), não há padrão claro
      if (mostQuotedProduct[1] < recentQuotes.length * 0.6) {
        return { hasPattern: false, confidence: 0.3 };
      }

      const product = mostQuotedProduct[0];
      const productQuotes = recentQuotes.filter((q) => (q.product ?? '') === product);

      // Calcular quantidade média (filtrar registros com quantity/unit preenchidos)
      const productQuotesWithQty = productQuotes
        .filter((q): q is typeof q & { quantity: string; unit: string } =>
          q.quantity !== null && q.unit !== null
        );
      const avgQuantity = this.calculateAverageQuantity(productQuotesWithQty);

      // Analisar frequência temporal
      const frequencyPattern = this.analyzeTemporalFrequency(productQuotes);

      if (!frequencyPattern) {
        return {
          hasPattern: true,
          product,
          averageQuantity: avgQuantity.quantity,
          averageUnit: avgQuantity.unit,
          confidence: 0.5,
        };
      }

      return {
        hasPattern: true,
        frequency: frequencyPattern.frequency,
        product,
        averageQuantity: avgQuantity.quantity,
        averageUnit: avgQuantity.unit,
        dayOfMonth: frequencyPattern.dayOfMonth,
        dayOfWeek: frequencyPattern.dayOfWeek,
        confidence: frequencyPattern.confidence,
      };
    } catch (error) {
      logger.error('Failed to detect quote pattern', { error, producerId });
      return { hasPattern: false, confidence: 0 };
    }
  }

  /**
   * Calcula quantidade média de cotações
   */
  private calculateAverageQuantity(
    quotes: Array<{ quantity: string; unit: string }>
  ): { quantity: string; unit: string } {
    if (quotes.length === 0) {
      return { quantity: '', unit: '' };
    }

    // Pegar unidade mais comum
    const unitCounts = new Map<string, number>();
    quotes.forEach((q) => {
      const count = unitCounts.get(q.unit) || 0;
      unitCounts.set(q.unit, count + 1);
    });

    const mostCommonUnit = Array.from(unitCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

    // Calcular média das quantidades (apenas números)
    const quantities = quotes
      .filter((q) => q.unit === mostCommonUnit)
      .map((q) => parseFloat(q.quantity.replace(/[^\d.]/g, '')))
      .filter((n) => !isNaN(n));

    if (quantities.length === 0) {
      return { quantity: quotes[0].quantity, unit: quotes[0].unit };
    }

    const avgQuantity = Math.round(
      quantities.reduce((sum, q) => sum + q, 0) / quantities.length
    );

    return { quantity: String(avgQuantity), unit: mostCommonUnit };
  }

  /**
   * Analisa frequência temporal das cotações
   */
  private analyzeTemporalFrequency(
    quotes: Array<{ createdAt: Date }>
  ): {
    frequency: 'weekly' | 'monthly' | 'biweekly';
    dayOfMonth?: number;
    dayOfWeek?: number;
    confidence: number;
  } | null {
    if (quotes.length < 3) {
      return null;
    }

    // Calcular intervalos entre cotações (em dias)
    const intervals: number[] = [];
    for (let i = 0; i < quotes.length - 1; i++) {
      const diff =
        (quotes[i].createdAt.getTime() - quotes[i + 1].createdAt.getTime()) /
        (24 * 60 * 60 * 1000);
      intervals.push(Math.round(diff));
    }

    // Calcular média e desvio padrão dos intervalos
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
    );

    // Se desvio padrão alto, não há padrão consistente
    if (stdDev > avgInterval * 0.3) {
      return null;
    }

    // Detectar frequência
    let frequency: 'weekly' | 'monthly' | 'biweekly';
    let confidence = 0.7;

    if (avgInterval >= 25 && avgInterval <= 35) {
      frequency = 'monthly';
      confidence = 0.9;

      // Detectar dia preferido do mês
      const daysOfMonth = quotes.map((q) => q.createdAt.getDate());
      const avgDay = Math.round(
        daysOfMonth.reduce((sum, d) => sum + d, 0) / daysOfMonth.length
      );

      return { frequency, dayOfMonth: avgDay, confidence };
    } else if (avgInterval >= 12 && avgInterval <= 16) {
      frequency = 'biweekly';
      confidence = 0.8;

      const daysOfWeek = quotes.map((q) => q.createdAt.getDay());
      const avgDay = Math.round(
        daysOfWeek.reduce((sum, d) => sum + d, 0) / daysOfWeek.length
      );

      return { frequency, dayOfWeek: avgDay, confidence };
    } else if (avgInterval >= 6 && avgInterval <= 8) {
      frequency = 'weekly';
      confidence = 0.8;

      const daysOfWeek = quotes.map((q) => q.createdAt.getDay());
      const avgDay = Math.round(
        daysOfWeek.reduce((sum, d) => sum + d, 0) / daysOfWeek.length
      );

      return { frequency, dayOfWeek: avgDay, confidence };
    }

    return null;
  }

  /**
   * Verifica se hoje é um bom dia para sugerir cotação
   */
  shouldSuggestQuote(
    pattern: {
      frequency?: 'weekly' | 'monthly' | 'biweekly';
      dayOfMonth?: number;
      dayOfWeek?: number;
      confidence: number;
    },
    lastQuoteDate: Date
  ): boolean {
    const today = new Date();
    const daysSinceLastQuote =
      (today.getTime() - lastQuoteDate.getTime()) / (24 * 60 * 60 * 1000);

    // Se não tem frequência definida, não sugerir
    if (!pattern.frequency) {
      return false;
    }

    // Se confiança baixa, não sugerir
    if (pattern.confidence < 0.6) {
      return false;
    }

    // Verificar se já passou tempo suficiente desde última cotação
    if (pattern.frequency === 'monthly') {
      // Sugerir se passou 25+ dias e estamos próximos do dia usual
      if (daysSinceLastQuote >= 25) {
        if (pattern.dayOfMonth) {
          const todayDay = today.getDate();
          // Janela de 3 dias antes/depois
          return Math.abs(todayDay - pattern.dayOfMonth) <= 3;
        }
        return true;
      }
    } else if (pattern.frequency === 'biweekly') {
      // Sugerir se passou 12+ dias e é o dia da semana usual
      if (daysSinceLastQuote >= 12) {
        if (pattern.dayOfWeek !== undefined) {
          return today.getDay() === pattern.dayOfWeek;
        }
        return true;
      }
    } else if (pattern.frequency === 'weekly') {
      // Sugerir se passou 6+ dias e é o dia da semana usual
      if (daysSinceLastQuote >= 6) {
        if (pattern.dayOfWeek !== undefined) {
          return today.getDay() === pattern.dayOfWeek;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Gera mensagem de sugestão proativa
   */
  generateProactiveSuggestion(pattern: {
    product?: string;
    averageQuantity?: string;
    averageUnit?: string;
    frequency?: 'weekly' | 'monthly' | 'biweekly';
  }): string {
    const frequencyMap = {
      weekly: 'toda semana',
      biweekly: 'a cada 2 semanas',
      monthly: 'todo mês',
    };

    let message = '💡 *Oi!*\n\n';
    message += 'Percebi um padrão nas suas cotações:\n\n';

    if (pattern.product) {
      message += `• Você costuma cotar *${pattern.product}*\n`;
    }

    if (pattern.frequency) {
      message += `• Geralmente ${frequencyMap[pattern.frequency]}\n`;
    }

    if (pattern.averageQuantity && pattern.averageUnit) {
      message += `• Quantidade média: *${pattern.averageQuantity} ${pattern.averageUnit}*\n`;
    }

    message += '\n*Quer que eu prepare uma cotação agora?*\n\n';
    message += '1️⃣ Sim, cotar agora\n';
    message += '2️⃣ Não, depois\n';
    message += '3️⃣ Criar cotação recorrente';

    return message;
  }
}

export const patternDetectionService = new PatternDetectionService();
