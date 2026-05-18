import { Request, Response } from 'express';
import { z } from 'zod';
import { ProposalTokenService } from '../../services/proposal-token.service';
import { prisma } from '../../config/database';
import { ErrorHandler } from '../../utils/error-handler';
import { supplierNotificationService } from '../../services/supplier-notification.service';
import { markQuoteResponse, tryConsolidateEarly } from '../../jobs/consolidate-quote.job';
import { logger } from '../../utils/logger';

const submitProposalSchema = z.object({
  items: z.array(
    z.object({
      quoteItemId: z.string().uuid(),
      unitPrice: z.number().positive(),
    })
  ).min(1, 'Informe o preço de ao menos um item'),
  paymentTerms: z.string().min(3, 'Condição de pagamento muito curta'),
  deliveryDays: z.number().int().positive('Prazo deve ser maior que zero'),
  observations: z.string().optional(),
});

export class ProposalController {
  /**
   * GET /api/proposta/:token
   * Retorna dados da cotação para preencher o formulário (público)
   */
  static getForm = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    let record;
    try {
      record = await ProposalTokenService.validate(token);
    } catch (err: any) {
      const messages: Record<string, string> = {
        TOKEN_NOT_FOUND: 'Link inválido ou expirado.',
        TOKEN_ALREADY_USED: 'Você já enviou uma proposta para esta cotação.',
        TOKEN_EXPIRED: 'Este link expirou. Solicite um novo ao CotaObra.',
        QUOTE_CLOSED: 'Esta cotação já foi encerrada.',
      };

      res.status(410).json({
        success: false,
        error: { code: err.message, message: messages[err.message] || 'Link inválido.' },
      });
      return;
    }

    const { quote, supplier, expiresAt } = record;

    res.json({
      success: true,
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        supplier: { name: supplier.name },
        quote: {
          producerName: quote.producer.name,
          producerCity: quote.producer.city,
          category: quote.category,
          region: quote.region,
          deadline: quote.deadline,
          freight: quote.freight,
          observations: quote.observations,
          items: quote.items.map((it) => ({
            id: it.id,
            product: it.product,
            quantity: it.quantity,
            unit: it.unit,
          })),
        },
      },
    });
  });

  /**
   * POST /api/proposta/:token
   * Recebe proposta preenchida no formulário (público)
   */
  static submitForm = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    let record;
    try {
      record = await ProposalTokenService.validate(token);
    } catch (err: any) {
      const messages: Record<string, string> = {
        TOKEN_NOT_FOUND: 'Link inválido ou expirado.',
        TOKEN_ALREADY_USED: 'Você já enviou uma proposta para esta cotação.',
        TOKEN_EXPIRED: 'Este link expirou.',
        QUOTE_CLOSED: 'Esta cotação já foi encerrada.',
      };

      res.status(410).json({
        success: false,
        error: { code: err.message, message: messages[err.message] || 'Link inválido.' },
      });
      return;
    }

    const parsed = submitProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
      });
      return;
    }

    const { items, paymentTerms, deliveryDays, observations } = parsed.data;
    const { quote, supplierId } = record;

    // Validar que os quoteItemIds pertencem a esta cotação
    const validItemIds = new Set(quote.items.map((it) => it.id));
    const invalidItems = items.filter((it) => !validItemIds.has(it.quoteItemId));
    if (invalidItems.length > 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ITEMS', message: 'Itens inválidos para esta cotação.' },
      });
      return;
    }

    // Calcular preços
    const proposalItemsData = items.map((it) => {
      const quoteItem = quote.items.find((qi) => qi.id === it.quoteItemId)!;
      return {
        quoteItemId: it.quoteItemId,
        unitPrice: it.unitPrice,
        totalPrice: it.unitPrice * quoteItem.quantity,
      };
    });

    const totalPrice = proposalItemsData.reduce((sum, it) => sum + it.totalPrice, 0);
    const isPartial = items.length < quote.items.length;

    // Verificar se já enviou proposta para esta cotação
    const existing = await prisma.proposal.findFirst({
      where: { quoteId: quote.id, supplierId },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Você já enviou uma proposta para esta cotação.' },
      });
      return;
    }

    const proposal = await prisma.$transaction(async (tx) => {
      const newProposal = await tx.proposal.create({
        data: {
          quoteId: quote.id,
          supplierId,
          tenantId: quote.tenantId,
          price: totalPrice,
          totalPrice,
          paymentTerms,
          deliveryDays,
          observations,
          isOwnSupplier: false,
          isPartial,
        },
      });

      await tx.proposalItem.createMany({
        data: proposalItemsData.map((it) => ({
          proposalId: newProposal.id,
          quoteItemId: it.quoteItemId,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
      });

      return newProposal;
    });

    // Marcar token como usado
    await ProposalTokenService.markUsed(token);

    // Enviar feedback ao fornecedor (assíncrono)
    supplierNotificationService.sendProposalRankingFeedback(proposal.id).catch((err) => {
      logger.error('Failed to send ranking feedback', { error: err, proposalId: proposal.id });
    });

    logger.info('Proposal submitted via form', { proposalId: proposal.id, quoteId: quote.id, supplierId, isPartial });

    // FEAT-EARLY-CLOSE — rastreia resposta e tenta consolidar cedo se
    // todos os convidados responderam (fluxo formulário web).
    await markQuoteResponse(quote.id, supplierId, 'PROPOSAL');
    tryConsolidateEarly(quote.id).catch((err) =>
      logger.error('tryConsolidateEarly after form proposal failed', {
        quoteId: quote.id,
        error: (err as Error).message,
      }),
    );

    res.status(201).json({
      success: true,
      data: {
        proposalId: proposal.id,
        totalPrice,
        isPartial,
        itemsSubmitted: items.length,
        itemsTotal: quote.items.length,
      },
    });
  });
}
