import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { PlanType } from '@prisma/client';
import { logger } from '../../utils/logger';

export class SubscriptionsController {
  // GET /api/subscriptions
  async list(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = '1',
        limit = '15',
        status,
        plan,
        search,
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = {};

      if (status === 'ACTIVE') {
        where.active = true;
      } else if (status === 'EXPIRED') {
        where.active = false;
      }

      if (plan) {
        where.plan = plan as PlanType;
      }

      if (search) {
        where.OR = [
          { producer: { name: { contains: search as string, mode: 'insensitive' } } },
          { producer: { cpfCnpj: { contains: (search as string).replace(/\D/g, '') } } },
        ];
      }

      // Get subscriptions with producer data
      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          include: {
            producer: {
              select: {
                id: true,
                name: true,
                cpfCnpj: true,
                phone: true,
                city: true,
                farm: true,
                region: true,
              },
            },
          },
          skip,
          take: limitNum,
          orderBy: [
            { active: 'desc' },
            { endDate: 'asc' },
          ],
        }),
        prisma.subscription.count({ where }),
      ]);

      // Calculate stats
      const stats = await this.calculateStats();

      // Enrich subscriptions with calculated fields
      const enrichedSubscriptions = subscriptions.map((sub) => {
        const now = new Date();
        const endDate = new Date(sub.endDate);
        const daysUntilRenewal = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const usagePercentage = (sub.quotesUsed / sub.quotesLimit) * 100;

        return {
          ...sub,
          daysUntilRenewal,
          usagePercentage: Math.round(usagePercentage),
        };
      });

      res.json({
        data: enrichedSubscriptions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        stats,
      });
    } catch (error) {
      logger.error('Error listing subscriptions:', error);
      res.status(500).json({ error: 'Erro ao listar assinaturas' });
    }
  }

  // GET /api/subscriptions/stats
  async calculateStats() {
    try {
      const activeSubscriptions = await prisma.subscription.count({
        where: { active: true },
      });

      const subscriptionsByPlan = await prisma.subscription.groupBy({
        by: ['plan'],
        where: { active: true },
        _count: true,
      });

      const planDistribution = subscriptionsByPlan.reduce((acc, item) => {
        acc[item.plan] = item._count;
        return acc;
      }, {} as Record<string, number>);

      // Calculate monthly revenue
      const planPrices: Record<PlanType, number> = {
        BASIC: 397,
        PRO: 497,
        ENTERPRISE: 797,
      };

      const monthlyRevenue = subscriptionsByPlan.reduce((sum, item) => {
        return sum + planPrices[item.plan] * item._count;
      }, 0);

      // Cancellations this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const cancellationsThisMonth = await prisma.subscription.count({
        where: {
          active: false,
          endDate: { gte: startOfMonth },
        },
      });

      // Renewal rate: assinaturas ativas que já passaram do endDate original pelo menos uma vez
      // Simplificação: ativas / (ativas + canceladas no último mês)
      const totalRelevant = activeSubscriptions + cancellationsThisMonth;
      const renewalRate = totalRelevant > 0
        ? Math.round((activeSubscriptions / totalRelevant) * 100)
        : 100;

      return {
        activeSubscriptions,
        monthlyRevenue,
        renewalRate,
        cancellationsThisMonth,
        planDistribution,
      };
    } catch (error) {
      logger.error('Error calculating stats:', error);
      return {
        activeSubscriptions: 0,
        monthlyRevenue: 0,
        renewalRate: 0,
        cancellationsThisMonth: 0,
        planDistribution: {},
      };
    }
  }

  // GET /api/subscriptions/:id
  async getOne(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const subscription = await prisma.subscription.findUnique({
        where: { id },
        include: {
          producer: true,
        },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Assinatura não encontrada' });
        return;
      }

      res.json(subscription);
    } catch (error) {
      logger.error('Error getting subscription:', error);
      res.status(500).json({ error: 'Erro ao buscar assinatura' });
    }
  }

  // POST /api/subscriptions
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { producerId, plan, duration, startDate } = req.body;

      // Validate producer exists
      const producer = await prisma.producer.findUnique({
        where: { id: producerId },
      });

      if (!producer) {
        res.status(404).json({ error: 'Produtor não encontrado' });
        return;
      }

      // Check if producer already has subscription
      const existing = await prisma.subscription.findUnique({
        where: { producerId },
      });

      if (existing) {
        res.status(400).json({ error: 'Produtor já possui assinatura' });
        return;
      }

      // Calculate quotes limit (sem trial — modelo exclusivamente pago)
      const quotesLimit = this.getQuotesLimit(plan);

      // Calculate end date
      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + (duration || 1));

      const subscription = await prisma.subscription.create({
        data: {
          producerId,
          tenantId: producer.tenantId,
          plan: plan as PlanType,
          quotesLimit,
          quotesUsed: 0,
          startDate: start,
          endDate: end,
          active: true,
        },
        include: {
          producer: true,
        },
      });

      res.status(201).json(subscription);
    } catch (error) {
      logger.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Erro ao criar assinatura' });
    }
  }

  // PATCH /api/subscriptions/:id/plan
  async updatePlan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { newPlan, applyImmediately } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { id },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Assinatura não encontrada' });
        return;
      }

      const newQuotesLimit = this.getQuotesLimit(newPlan);

      // Validate downgrade
      if (newQuotesLimit < subscription.quotesLimit && subscription.quotesUsed > newQuotesLimit) {
        res.status(400).json({
          error: `Não é possível fazer downgrade. Produtor já usou ${subscription.quotesUsed} cotações, mas novo limite é ${newQuotesLimit}.`,
        });
        return;
      }

      if (applyImmediately) {
        // Apply immediately
        await prisma.subscription.update({
          where: { id },
          data: {
            plan: newPlan as PlanType,
            quotesLimit: newQuotesLimit,
          },
        });
      } else {
        // Apply on next renewal (would need a "pendingPlan" field in schema)
        // For now, just update immediately
        await prisma.subscription.update({
          where: { id },
          data: {
            plan: newPlan as PlanType,
            quotesLimit: newQuotesLimit,
          },
        });
      }

      const updated = await prisma.subscription.findUnique({
        where: { id },
        include: { producer: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error('Error updating plan:', error);
      res.status(500).json({ error: 'Erro ao atualizar plano' });
    }
  }

  // POST /api/subscriptions/:id/renew
  async renew(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { duration } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { id },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Assinatura não encontrada' });
        return;
      }

      // Calculate new end date
      const newEndDate = new Date(subscription.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + duration);

      // Reset quotas
      const updated = await prisma.subscription.update({
        where: { id },
        data: {
          endDate: newEndDate,
          quotesUsed: 0,
          active: true,
        },
        include: { producer: true },
      });

      // TODO: Generate payment link based on paymentMethod
      // For now, just return the updated subscription

      res.json(updated);
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      res.status(500).json({ error: 'Erro ao renovar assinatura' });
    }
  }

  // POST /api/subscriptions/:id/cancel
  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { immediate } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { id },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Assinatura não encontrada' });
        return;
      }

      if (immediate) {
        // Cancel immediately
        await prisma.subscription.update({
          where: { id },
          data: {
            active: false,
          },
        });
      } else {
        // Cancel at end of period (just mark it)
        await prisma.subscription.update({
          where: { id },
          data: {
            active: false,
          },
        });
      }

      // TODO: Send WhatsApp notification to producer
      // TODO: Log cancellation reason

      const updated = await prisma.subscription.findUnique({
        where: { id },
        include: { producer: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Erro ao cancelar assinatura' });
    }
  }

  // POST /api/subscriptions/:id/reset-quota
  async resetQuota(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const subscription = await prisma.subscription.findUnique({
        where: { id },
      });

      if (!subscription) {
        res.status(404).json({ error: 'Assinatura não encontrada' });
        return;
      }

      const updated = await prisma.subscription.update({
        where: { id },
        data: { quotesUsed: 0 },
        include: { producer: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error('Error resetting quota:', error);
      res.status(500).json({ error: 'Erro ao resetar quota' });
    }
  }

  private getQuotesLimit(plan: string): number {
    const limits: Record<string, number> = {
      BASIC: 20,
      PRO: 100,
      ENTERPRISE: 999999, // "unlimited"
    };
    return limits[plan] || 20;
  }
}
