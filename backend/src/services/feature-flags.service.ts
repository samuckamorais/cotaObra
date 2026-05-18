import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Configuração de uma variante de experimento
 */
export interface ExperimentVariant {
  name: string;
  weight: number; // 0-100, soma de todos deve ser 100
  config?: Record<string, any>; // configurações específicas da variante
}

/**
 * Serviço de Feature Flags e A/B Testing
 * Permite experimentação controlada de features
 */
export class FeatureFlagsService {
  /**
   * Cria ou atualiza um experimento
   */
  async createExperiment(params: {
    tenantId: string;
    name: string;
    description?: string;
    variants: ExperimentVariant[];
    active?: boolean;
    endDate?: Date;
  }): Promise<void> {
    // Validar que pesos somam 100
    const totalWeight = params.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error(`Variant weights must sum to 100, got ${totalWeight}`);
    }

    await prisma.experiment.upsert({
      where: { tenantId_name: { tenantId: params.tenantId, name: params.name } },
      create: {
        tenantId: params.tenantId,
        name: params.name,
        description: params.description,
        variants: params.variants as any,
        active: params.active ?? true,
        endDate: params.endDate,
      },
      update: {
        description: params.description,
        variants: params.variants as any,
        active: params.active,
        endDate: params.endDate,
      },
    });

    logger.info('Experiment created/updated', {
      name: params.name,
      variants: params.variants.length,
    });
  }

  /**
   * Atribui usuário a uma variante do experimento
   * Usa hash determinístico para garantir consistência
   */
  async assignVariant(params: {
    experimentName: string;
    userId: string;
    userType: 'producer' | 'supplier';
  }): Promise<string> {
    // Verificar se experimento existe e está ativo
    const experiment = await prisma.experiment.findFirst({
      where: { name: params.experimentName },
    });

    if (!experiment) {
      throw new Error(`Experiment ${params.experimentName} not found`);
    }

    if (!experiment.active) {
      // Se experimento inativo, retornar controle
      return 'control';
    }

    // Verificar se usuário já tem atribuição
    const existing = await prisma.experimentAssignment.findUnique({
      where: {
        experimentId_userId_userType: {
          experimentId: experiment.id,
          userId: params.userId,
          userType: params.userType,
        },
      },
    });

    if (existing) {
      return existing.variant;
    }

    // Atribuir nova variante usando hash determinístico
    const variants = experiment.variants as unknown as ExperimentVariant[];
    const variant = this.selectVariantByHash(params.userId, variants);

    // Salvar atribuição
    await prisma.experimentAssignment.create({
      data: {
        experimentId: experiment.id,
        tenantId: experiment.tenantId,
        userId: params.userId,
        userType: params.userType,
        variant,
      },
    });

    logger.info('User assigned to variant', {
      experiment: params.experimentName,
      userId: params.userId,
      variant,
    });

    return variant;
  }

  /**
   * Seleciona variante baseada em hash do userId
   * Garante distribuição consistente e determinística
   */
  private selectVariantByHash(userId: string, variants: ExperimentVariant[]): string {
    // Gerar hash do userId (0-100)
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16) % 100;

    // Selecionar variante baseada nos pesos
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight;
      if (hashValue < cumulative) {
        return variant.name;
      }
    }

    // Fallback (não deve acontecer se pesos somam 100)
    return variants[0].name;
  }

  /**
   * Verifica se feature está habilitada para o usuário
   * Suporta feature flags simples (on/off) e experimentos A/B
   */
  async isFeatureEnabled(params: {
    featureName: string;
    userId: string;
    userType: 'producer' | 'supplier';
    defaultValue?: boolean;
  }): Promise<boolean> {
    try {
      const variant = await this.assignVariant({
        experimentName: params.featureName,
        userId: params.userId,
        userType: params.userType,
      });

      // Por convenção: "control" = feature desabilitada, "treatment" = habilitada
      return variant !== 'control';
    } catch (error) {
      // Se experimento não existe, usar valor padrão
      return params.defaultValue ?? false;
    }
  }

  /**
   * Retorna configuração da variante para o usuário
   */
  async getVariantConfig(params: {
    experimentName: string;
    userId: string;
    userType: 'producer' | 'supplier';
  }): Promise<Record<string, any> | null> {
    const variant = await this.assignVariant(params);

    const experiment = await prisma.experiment.findFirst({
      where: { name: params.experimentName },
    });

    if (!experiment) {
      return null;
    }

    const variants = experiment.variants as unknown as ExperimentVariant[];
    const variantConfig = variants.find((v) => v.name === variant);

    return variantConfig?.config || null;
  }

  /**
   * Retorna estatísticas do experimento
   */
  async getExperimentStats(experimentName: string): Promise<{
    totalAssignments: number;
    variantDistribution: Array<{ variant: string; count: number; percentage: number }>;
  }> {
    const experiment = await prisma.experiment.findFirst({
      where: { name: experimentName },
      include: {
        assignments: true,
      },
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentName} not found`);
    }

    const totalAssignments = experiment.assignments.length;

    // Agrupar por variante
    const variantCounts = new Map<string, number>();
    experiment.assignments.forEach((assignment: any) => {
      const count = variantCounts.get(assignment.variant) || 0;
      variantCounts.set(assignment.variant, count + 1);
    });

    const variantDistribution = Array.from(variantCounts.entries()).map(([variant, count]) => ({
      variant,
      count,
      percentage: totalAssignments > 0 ? parseFloat(((count / totalAssignments) * 100).toFixed(2)) : 0,
    }));

    return {
      totalAssignments,
      variantDistribution,
    };
  }

  /**
   * Compara métricas entre variantes de um experimento
   */
  async compareVariantMetrics(params: {
    experimentName: string;
    metricName: 'conversion_rate' | 'avg_messages' | 'completion_time';
    startDate: Date;
    endDate: Date;
  }): Promise<
    Array<{
      variant: string;
      value: number;
      sampleSize: number;
    }>
  > {
    const experiment = await prisma.experiment.findFirst({
      where: { name: params.experimentName },
      include: {
        assignments: true,
      },
    });

    if (!experiment) {
      throw new Error(`Experiment ${params.experimentName} not found`);
    }

    // Agrupar usuários por variante
    const usersByVariant = new Map<string, string[]>();
    experiment.assignments.forEach((assignment: any) => {
      const users = usersByVariant.get(assignment.variant) || [];
      users.push(assignment.userId);
      usersByVariant.set(assignment.variant, users);
    });

    // Calcular métrica para cada variante
    const results: Array<{ variant: string; value: number; sampleSize: number }> = [];

    for (const [variant, userIds] of usersByVariant.entries()) {
      let value = 0;
      const sampleSize = userIds.length;

      if (params.metricName === 'conversion_rate') {
        const completed = await prisma.conversationMetric.count({
          where: {
            userId: { in: userIds },
            eventType: 'quote_completed',
            timestamp: {
              gte: params.startDate,
              lte: params.endDate,
            },
          },
        });
        value = sampleSize > 0 ? (completed / sampleSize) * 100 : 0;
      } else if (params.metricName === 'avg_messages') {
        const messages = await prisma.conversationMetric.count({
          where: {
            userId: { in: userIds },
            eventType: { in: ['message_sent', 'message_received'] },
            timestamp: {
              gte: params.startDate,
              lte: params.endDate,
            },
          },
        });
        value = sampleSize > 0 ? messages / sampleSize : 0;
      } else if (params.metricName === 'completion_time') {
        const durations = await prisma.conversationMetric.aggregate({
          where: {
            userId: { in: userIds },
            eventType: 'state_changed',
            durationMs: { not: null },
            timestamp: {
              gte: params.startDate,
              lte: params.endDate,
            },
          },
          _avg: {
            durationMs: true,
          },
        });
        value = durations._avg.durationMs ? durations._avg.durationMs / 1000 : 0; // em segundos
      }

      results.push({
        variant,
        value: parseFloat(value.toFixed(2)),
        sampleSize,
      });
    }

    return results;
  }

  /**
   * Desativa experimento
   */
  async deactivateExperiment(experimentName: string): Promise<void> {
    const experiment = await prisma.experiment.findFirst({
      where: { name: experimentName },
    });
    if (!experiment) {
      throw new Error(`Experiment ${experimentName} not found`);
    }
    await prisma.experiment.update({
      where: { id: experiment.id },
      data: {
        active: false,
        endDate: new Date(),
      },
    });

    logger.info('Experiment deactivated', { experimentName });
  }

  /**
   * Lista todos os experimentos ativos
   */
  async listActiveExperiments(): Promise<
    Array<{
      name: string;
      description: string | null;
      variants: ExperimentVariant[];
      assignmentCount: number;
    }>
  > {
    const experiments = await prisma.experiment.findMany({
      where: { active: true },
      include: {
        _count: {
          select: { assignments: true },
        },
      },
    });

    return experiments.map((exp: any) => ({
      name: exp.name,
      description: exp.description,
      variants: exp.variants as unknown as ExperimentVariant[],
      assignmentCount: exp._count.assignments,
    }));
  }
}

export const featureFlagsService = new FeatureFlagsService();
