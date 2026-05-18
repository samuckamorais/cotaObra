import { Request, Response } from 'express';
import { metricsService } from '../../services/metrics.service';
import { featureFlagsService } from '../../services/feature-flags.service';
import { logger } from '../../utils/logger';

/**
 * Controller para endpoints de analytics e métricas
 */
export class AnalyticsController {
  /**
   * GET /analytics/overview
   * Retorna estatísticas gerais do período
   */
  async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const stats = await metricsService.getOverallStats({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get overview stats', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /analytics/conversion-rate
   * Retorna taxa de conversão do período
   */
  async getConversionRate(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const conversionRate = await metricsService.getConversionRate({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(conversionRate);
    } catch (error) {
      logger.error('Failed to get conversion rate', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /analytics/funnel
   * Retorna funil de conversão
   */
  async getConversionFunnel(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const funnel = await metricsService.getConversionFunnel({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(funnel);
    } catch (error) {
      logger.error('Failed to get conversion funnel', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /analytics/time-per-state
   * Retorna tempo médio por estado
   */
  async getTimePerState(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const timePerState = await metricsService.getAverageTimePerState({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(timePerState);
    } catch (error) {
      logger.error('Failed to get time per state', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /analytics/errors
   * Retorna distribuição de erros
   */
  async getErrorDistribution(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const errors = await metricsService.getErrorDistribution({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(errors);
    } catch (error) {
      logger.error('Failed to get error distribution', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /analytics/first-response-rate
   * Retorna taxa de primeira resposta por dia
   */
  async getFirstResponseRate(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, userType } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'startDate and endDate are required' });
        return;
      }

      const firstResponseRate = await metricsService.getFirstResponseRate({
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        userType: userType as 'producer' | 'supplier' | undefined,
      });

      res.json(firstResponseRate);
    } catch (error) {
      logger.error('Failed to get first response rate', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /experiments
   * Lista todos os experimentos ativos
   */
  async listExperiments(_req: Request, res: Response): Promise<void> {
    try {
      const experiments = await featureFlagsService.listActiveExperiments();
      res.json(experiments);
    } catch (error) {
      logger.error('Failed to list experiments', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /experiments/:name/stats
   * Retorna estatísticas de um experimento
   */
  async getExperimentStats(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const stats = await featureFlagsService.getExperimentStats(name);
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get experiment stats', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /experiments/:name/compare
   * Compara métricas entre variantes
   */
  async compareVariants(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      const { metricName, startDate, endDate } = req.query;

      if (!metricName || !startDate || !endDate) {
        res.status(400).json({ error: 'metricName, startDate and endDate are required' });
        return;
      }

      const comparison = await featureFlagsService.compareVariantMetrics({
        experimentName: name,
        metricName: metricName as 'conversion_rate' | 'avg_messages' | 'completion_time',
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
      });

      res.json(comparison);
    } catch (error) {
      logger.error('Failed to compare variants', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /experiments
   * Cria novo experimento
   */
  async createExperiment(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, variants, active, endDate } = req.body;

      if (!name || !variants) {
        res.status(400).json({ error: 'name and variants are required' });
        return;
      }

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'tenantId não encontrado no usuário autenticado' });
        return;
      }
      await featureFlagsService.createExperiment({
        tenantId,
        name,
        description,
        variants,
        active,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      res.status(201).json({ message: 'Experiment created successfully' });
    } catch (error) {
      logger.error('Failed to create experiment', { error });
      res.status(500).json({ error: (error as Error).message || 'Internal server error' });
    }
  }

  /**
   * DELETE /experiments/:name
   * Desativa experimento
   */
  async deactivateExperiment(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;
      await featureFlagsService.deactivateExperiment(name);
      res.json({ message: 'Experiment deactivated successfully' });
    } catch (error) {
      logger.error('Failed to deactivate experiment', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const analyticsController = new AnalyticsController();
