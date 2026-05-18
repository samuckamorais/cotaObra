import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Tipos de eventos que podem ser trackeados
 */
export type MetricEventType =
  | 'message_sent'
  | 'message_received'
  | 'state_changed'
  | 'error'
  | 'quote_completed'
  | 'quote_abandoned'
  | 'proposal_sent'
  | 'proposal_accepted'
  | 'proposal_rejected';

/**
 * Serviço para tracking de métricas de conversação
 * Usado para analytics, dashboards e otimização de conversão
 */
export class MetricsService {
  /**
   * Registra evento de métrica
   */
  async trackEvent(params: {
    userId: string;
    userType: 'producer' | 'supplier';
    eventType: MetricEventType;
    state?: string;
    previousState?: string;
    errorType?: string;
    metadata?: Record<string, any>;
    durationMs?: number;
  }): Promise<void> {
    try {
      let tenantId: string | null = null;
      if (params.userType === 'producer') {
        const entity = await prisma.producer.findUnique({
          where: { id: params.userId },
          select: { tenantId: true },
        });
        tenantId = entity?.tenantId ?? null;
      } else {
        const entity = await prisma.supplier.findUnique({
          where: { id: params.userId },
          select: { tenantId: true },
        });
        tenantId = entity?.tenantId ?? null;
      }
      if (!tenantId) return;

      await prisma.conversationMetric.create({
        data: {
          tenantId,
          userId: params.userId,
          userType: params.userType,
          eventType: params.eventType,
          state: params.state,
          previousState: params.previousState,
          errorType: params.errorType,
          metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : null,
          durationMs: params.durationMs,
        },
      });

      logger.debug('Metric tracked', {
        userId: params.userId,
        eventType: params.eventType,
        state: params.state,
      });
    } catch (error) {
      // Não deve falhar a operação principal se tracking falhar
      logger.error('Failed to track metric', { error, params });
    }
  }

  /**
   * Calcula taxa de conversão (completion rate) por período
   */
  async getConversionRate(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<{
    started: number;
    completed: number;
    abandoned: number;
    conversionRate: number;
  }> {
    const where = {
      timestamp: {
        gte: params.startDate,
        lte: params.endDate,
      },
      ...(params.userType && { userType: params.userType }),
    };

    const [started, completed, abandoned] = await Promise.all([
      prisma.conversationMetric.count({
        where: {
          ...where,
          eventType: 'message_received',
          state: 'IDLE',
        },
      }),
      prisma.conversationMetric.count({
        where: {
          ...where,
          eventType: 'quote_completed',
        },
      }),
      prisma.conversationMetric.count({
        where: {
          ...where,
          eventType: 'quote_abandoned',
        },
      }),
    ]);

    const conversionRate = started > 0 ? (completed / started) * 100 : 0;

    return {
      started,
      completed,
      abandoned,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
    };
  }

  /**
   * Retorna funil de conversão (quantos usuários em cada estado)
   */
  async getConversionFunnel(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<Array<{ state: string; count: number; dropoffRate: number }>> {
    const metrics = await prisma.conversationMetric.groupBy({
      by: ['state'],
      where: {
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
        eventType: 'state_changed',
        state: { not: null },
        ...(params.userType && { userType: params.userType }),
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const funnel = metrics.map((m, index) => {
      const count = m._count.id;
      const previousCount = index > 0 ? metrics[index - 1]._count.id : count;
      const dropoffRate = previousCount > 0 ? ((previousCount - count) / previousCount) * 100 : 0;

      return {
        state: m.state!,
        count,
        dropoffRate: parseFloat(dropoffRate.toFixed(2)),
      };
    });

    return funnel;
  }

  /**
   * Calcula tempo médio por estado
   */
  async getAverageTimePerState(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<Array<{ state: string; avgDurationMs: number; avgDurationSeconds: number }>> {
    const metrics = await prisma.conversationMetric.groupBy({
      by: ['state'],
      where: {
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
        eventType: 'state_changed',
        state: { not: null },
        durationMs: { not: null },
        ...(params.userType && { userType: params.userType }),
      },
      _avg: {
        durationMs: true,
      },
    });

    return metrics
      .filter((m) => m._avg.durationMs !== null)
      .map((m) => ({
        state: m.state!,
        avgDurationMs: Math.round(m._avg.durationMs!),
        avgDurationSeconds: parseFloat((m._avg.durationMs! / 1000).toFixed(2)),
      }));
  }

  /**
   * Retorna distribuição de erros por tipo
   */
  async getErrorDistribution(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<Array<{ errorType: string; count: number; percentage: number }>> {
    const metrics = await prisma.conversationMetric.groupBy({
      by: ['errorType'],
      where: {
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
        eventType: 'error',
        errorType: { not: null },
        ...(params.userType && { userType: params.userType }),
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const total = metrics.reduce((sum, m) => sum + m._count.id, 0);

    return metrics.map((m) => ({
      errorType: m.errorType!,
      count: m._count.id,
      percentage: parseFloat(((m._count.id / total) * 100).toFixed(2)),
    }));
  }

  /**
   * Retorna taxa de primeira resposta por dia
   */
  async getFirstResponseRate(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<Array<{ date: string; welcomed: number; responded: number; rate: number }>> {
    // Buscar todos os eventos de welcome e primeira resposta
    const metrics = await prisma.conversationMetric.findMany({
      where: {
        timestamp: {
          gte: params.startDate,
          lte: params.endDate,
        },
        eventType: {
          in: ['message_sent', 'message_received'],
        },
        ...(params.userType && { userType: params.userType }),
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    // Agrupar por data
    const byDate = new Map<string, { welcomed: number; responded: number }>();

    metrics.forEach((metric) => {
      const dateStr = metric.timestamp.toISOString().split('T')[0];

      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, { welcomed: 0, responded: 0 });
      }

      const data = byDate.get(dateStr)!;

      if (metric.eventType === 'message_sent' && metric.state === 'IDLE') {
        data.welcomed++;
      } else if (metric.eventType === 'message_received') {
        data.responded++;
      }
    });

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      welcomed: data.welcomed,
      responded: data.responded,
      rate: data.welcomed > 0 ? parseFloat(((data.responded / data.welcomed) * 100).toFixed(2)) : 0,
    }));
  }

  /**
   * Retorna estatísticas gerais do período
   */
  async getOverallStats(params: {
    startDate: Date;
    endDate: Date;
    userType?: 'producer' | 'supplier';
  }): Promise<{
    totalMessages: number;
    totalConversations: number;
    totalErrors: number;
    errorRate: number;
    avgMessagesPerConversation: number;
  }> {
    const where = {
      timestamp: {
        gte: params.startDate,
        lte: params.endDate,
      },
      ...(params.userType && { userType: params.userType }),
    };

    const [totalMessages, totalConversations, totalErrors] = await Promise.all([
      prisma.conversationMetric.count({
        where: {
          ...where,
          eventType: {
            in: ['message_sent', 'message_received'],
          },
        },
      }),
      prisma.conversationMetric.groupBy({
        by: ['userId'],
        where,
        _count: {
          id: true,
        },
      }).then((results) => results.length),
      prisma.conversationMetric.count({
        where: {
          ...where,
          eventType: 'error',
        },
      }),
    ]);

    const errorRate = totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0;
    const avgMessagesPerConversation =
      totalConversations > 0 ? totalMessages / totalConversations : 0;

    return {
      totalMessages,
      totalConversations,
      totalErrors,
      errorRate: parseFloat(errorRate.toFixed(2)),
      avgMessagesPerConversation: parseFloat(avgMessagesPerConversation.toFixed(2)),
    };
  }

  /**
   * Limpa métricas antigas (para manutenção)
   */
  async cleanOldMetrics(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.conversationMetric.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    logger.info('Old metrics cleaned', {
      cutoffDate,
      deletedCount: result.count,
    });

    return result.count;
  }
}

export const metricsService = new MetricsService();
