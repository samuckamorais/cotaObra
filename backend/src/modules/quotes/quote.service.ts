import { prisma } from '../../config/database';
import { CreateQuoteDTO, PaginatedResponse, QuoteStatus } from '../../types';
import { createError } from '../../utils/error-handler';
import { logger } from '../../utils/logger';
import { dispatchQuoteJob } from '../../jobs/dispatch-quote.job';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { Messages } from '../../flows/messages';
import { TenantSettingsService } from '../../services/tenant-settings.service';
import { getPlanLimits, getUpgradePlan } from '../../config/plans';
import { analyticsService } from '../../services/analytics.service';

export class QuoteService {
  /**
   * Lista cotações com paginação e filtros
   */
  static async list(
    tenantId: string,
    page = 1,
    limit = 10,
    filters?: {
      status?: QuoteStatus;
      producerId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<PaginatedResponse<any>> {
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.producerId) {
      where.producerId = filters.producerId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        skip,
        take: limit,
        where,
        include: {
          producer: {
            select: {
              id: true,
              name: true,
              phone: true,
              region: true,
            },
          },
          _count: {
            select: {
              proposals: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quote.count({ where }),
    ]);

    return {
      data: quotes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca cotação por ID com propostas
   */
  static async getById(tenantId: string, id: string) {
    const quote = await prisma.quote.findFirst({
      where: { id, tenantId },
      include: {
        producer: true,
        proposals: {
          include: {
            supplier: true,
          },
          orderBy: [{ price: 'asc' }, { deliveryDays: 'asc' }],
        },
      },
    });

    if (!quote) {
      throw createError.notFound('Cotação não encontrada');
    }

    return quote;
  }

  /**
   * Cria nova cotação (usado pela API, não pela FSM)
   */
  static async create(tenantId: string, data: CreateQuoteDTO) {
    // Verificar se produtor existe E pertence ao tenant
    const producer = await prisma.producer.findFirst({
      where: { id: data.producerId, tenantId },
      include: { subscription: true },
    });

    if (!producer) {
      throw createError.notFound('Produtor não encontrado');
    }

    // Verificar limite de cotações
    if (producer.subscription) {
      if (producer.subscription.quotesUsed >= producer.subscription.quotesLimit) {
        throw createError.quotaExceeded(
          `Limite de ${producer.subscription.quotesLimit} cotações atingido`
        );
      }
    }

    // Calcular expiresAt conforme configuração do tenant (CO-0-04: settings movidos
    // de Producer para Tenant — todos os usuários do mesmo tenant compartilham).
    const tenantSettings = await TenantSettingsService.getOrCreate(tenantId);
    const expiresAt = new Date(Date.now() + tenantSettings.quoteExpiryHours * 60 * 60 * 1000);

    const quote = await prisma.quote.create({
      data: {
        tenantId,
        producerId: data.producerId,
        product: data.product,
        quantity: data.quantity,
        unit: data.unit,
        region: data.region,
        deadline: data.deadline,
        observations: data.observations,
        supplierScope: data.supplierScope,
        status: 'PENDING',
        expiresAt,
      },
      include: {
        producer: true,
      },
    });

    // Incrementar contador de cotações usadas
    if (producer.subscription) {
      await prisma.subscription.update({
        where: { id: producer.subscription.id },
        data: { quotesUsed: { increment: 1 } },
      });
    }

    logger.info('Quote created', { quoteId: quote.id, producerId: data.producerId, tenantId });
    analyticsService.trackEvent('quote_created', { quoteId: quote.id, producerId: data.producerId, tenantId });

    return quote;
  }

  /**
   * Dispara cotação para fornecedores
   */
  static async dispatch(tenantId: string, id: string) {
    const quote = await this.getById(tenantId, id);

    if (quote.status !== 'PENDING') {
      throw createError.badRequest('Cotação já foi disparada');
    }

    const suppliersCount = await dispatchQuoteJob(id);

    logger.info('Quote dispatch initiated', { quoteId: id, suppliersCount, tenantId });
    analyticsService.trackEvent('quote_dispatched', { quoteId: id, suppliersCount, tenantId });

    return { suppliersCount };
  }

  /**
   * Fecha cotação com fornecedor escolhido
   */
  static async close(tenantId: string, id: string, supplierId: string) {
    const quote = await this.getById(tenantId, id);

    if (quote.status === 'CLOSED') {
      throw createError.badRequest('Cotação já está fechada');
    }

    if (quote.status !== 'SUMMARIZED') {
      throw createError.badRequest('Cotação precisa estar consolidada para ser fechada');
    }

    // Verificar se fornecedor tem proposta nesta cotação
    const proposal = await prisma.proposal.findFirst({
      where: {
        tenantId,
        quoteId: id,
        supplierId,
      },
      include: {
        supplier: true,
      },
    });

    if (!proposal) {
      throw createError.notFound('Fornecedor não tem proposta nesta cotação');
    }

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedSupplierId: supplierId,
      },
      include: {
        producer: true,
        proposals: {
          include: {
            supplier: true,
          },
        },
      },
    });

    logger.info('Quote closed', {
      quoteId: id,
      supplierId,
      supplierName: proposal.supplier.name,
      tenantId,
    });
    analyticsService.trackEvent('quote_closed', { quoteId: id, supplierId, tenantId });

    return updatedQuote;
  }

  /**
   * Notifica o fornecedor vencedor via WhatsApp
   */
  static async notifyWinner(
    tenantId: string,
    id: string,
    notificationType: 'selected' | 'producer_will_contact'
  ) {
    const quote = await this.getById(tenantId, id);

    if (quote.status !== 'CLOSED' || !quote.closedSupplierId) {
      throw createError.badRequest('Cotação não está fechada ou sem fornecedor selecionado');
    }

    const winningProposal = (quote.proposals as any[]).find(
      (p: any) => p.supplierId === quote.closedSupplierId
    );

    if (!winningProposal) {
      throw createError.notFound('Proposta vencedora não encontrada');
    }

    const body =
      notificationType === 'selected'
        ? Messages.PROPOSAL_SELECTED({
            producerName: quote.producer.name,
            producerPhone: quote.producer.phone,
          })
        : Messages.QUOTE_CLOSED_PRODUCER_CONTACTS(quote.producer.name);

    await whatsappService.sendMessage({ to: winningProposal.supplier.phone, body });

    logger.info('Winner notified manually', {
      quoteId: id,
      supplierId: quote.closedSupplierId,
      notificationType,
      tenantId,
    });

    return {
      supplierId: quote.closedSupplierId,
      supplierName: winningProposal.supplier.name,
    };
  }

  /**
   * Retorna limite de fornecedores por cotação baseado no plano do produtor.
   */
  static async getSupplierLimit(producerId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { producerId, active: true },
    });

    const planName = subscription?.plan ?? 'BASIC';
    const limits = getPlanLimits(planName);
    const upgradeTo = getUpgradePlan(planName);

    return {
      plan: planName,
      suppliersPerQuote: isFinite(limits.suppliersPerQuote) ? limits.suppliersPerQuote : null,
      upgradeTo,
    };
  }

  /**
   * Estatísticas de cotações
   */
  static async getStats(tenantId: string) {
    const [
      totalQuotes,
      pendingQuotes,
      collectingQuotes,
      closedQuotes,
      expiredQuotes,
      quotesToday,
    ] = await Promise.all([
      prisma.quote.count({ where: { tenantId } }),
      prisma.quote.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.quote.count({ where: { tenantId, status: 'COLLECTING' } }),
      prisma.quote.count({ where: { tenantId, status: 'CLOSED' } }),
      prisma.quote.count({ where: { tenantId, status: 'EXPIRED' } }),
      prisma.quote.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      totalQuotes,
      pendingQuotes,
      collectingQuotes,
      closedQuotes,
      expiredQuotes,
      quotesToday,
      closureRate: totalQuotes > 0 ? ((closedQuotes / totalQuotes) * 100).toFixed(2) : '0.00',
    };
  }
}
