import { Request, Response } from 'express';
import { QuoteService } from './quote.service';
import { ErrorHandler, createError } from '../../utils/error-handler';
import { createQuoteSchema, paginationSchema } from '../../utils/validators';
import { QuoteResultsService } from '../../services/quote-results.service';
import { SupplierSuggestionService } from '../../services/supplier-suggestion.service';
import { SupplierStatusService } from '../../services/supplier-status.service';
import { z } from 'zod';

export class QuoteController {
  /**
   * GET /api/quotes
   */
  static list = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = paginationSchema.parse(req.query);
    const tenantId = (req as any).user?.tenantId!;

    const filterSchema = z.object({
      status: z.enum(['PENDING', 'COLLECTING', 'SUMMARIZED', 'CLOSED', 'EXPIRED']).optional(),
      producerId: z.string().uuid().optional(),
      startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
      endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    });

    const filters = filterSchema.parse(req.query);

    const result = await QuoteService.list(tenantId, page, limit, filters);

    res.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/quotes/:id
   */
  static getById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tenantId = (req as any).user?.tenantId!;

    const quote = await QuoteService.getById(tenantId, id);

    res.json({
      success: true,
      data: quote,
    });
  });

  /**
   * POST /api/quotes
   */
  static create = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = createQuoteSchema.parse(req.body);
    const tenantId = (req as any).user?.tenantId!;

    const quote = await QuoteService.create(tenantId, data);

    res.status(201).json({
      success: true,
      data: quote,
    });
  });

  /**
   * POST /api/quotes/:id/dispatch
   */
  static dispatch = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tenantId = (req as any).user?.tenantId!;

    const result = await QuoteService.dispatch(tenantId, id);

    res.json({
      success: true,
      message: 'Cotação disparada com sucesso',
      data: result,
    });
  });

  /**
   * PUT /api/quotes/:id/close
   */
  static close = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { supplierId } = req.body;
    const tenantId = (req as any).user?.tenantId!;

    if (!supplierId) {
      throw createError.badRequest('supplierId é obrigatório');
    }

    const quote = await QuoteService.close(tenantId, id, supplierId);

    res.json({
      success: true,
      message: 'Cotação fechada com sucesso',
      data: quote,
    });
  });

  /**
   * GET /api/quotes/stats
   */
  static getStats = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId!;
    const stats = await QuoteService.getStats(tenantId);

    res.json({
      success: true,
      data: stats,
    });
  });

  /**
   * GET /api/quotes/supplier-limit
   * Retorna limite de fornecedores por cotação do plano atual
   */
  static getSupplierLimit = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).user;
    const producerId = user?.producerId;

    if (!producerId) {
      // Buscar produtor do tenant
      const producer = await (await import('../../config/database')).prisma.producer.findFirst({
        where: { tenantId: user?.tenantId },
        select: { id: true },
      });
      const limit = await QuoteService.getSupplierLimit(producer?.id ?? '');
      res.json({ success: true, data: limit });
      return;
    }

    const limit = await QuoteService.getSupplierLimit(producerId);
    res.json({ success: true, data: limit });
  });

  /**
   * GET /api/quotes/:id/results
   * Retorna propostas comparadas para a página de resultados
   */
  static getResults = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tenantId = (req as any).user?.tenantId!;

    const results = await QuoteResultsService.getResults(tenantId, id);

    res.json({
      success: true,
      data: results,
    });
  });

  /**
   * GET /api/quotes/:id/suggested-suppliers
   * CO-3-01 — Sugere até 8 fornecedores ranqueados (categoria, região,
   * rating, velocidade) para esta cotação.
   */
  static suggestedSuppliers = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const tenantId = (req as any).user?.tenantId!;
      const suggestions = await SupplierSuggestionService.suggestForQuote(tenantId, id);
      res.json({ success: true, data: suggestions });
    },
  );

  /**
   * GET /api/quotes/:id/supplier-status
   * CO-3-09 — Lista fornecedores convidados + status agregado (SENT/DELIVERED/
   * READ/RESPONDED/FAILED) para o quadro de status do QuoteDetail.
   */
  static supplierStatus = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const tenantId = (req as any).user?.tenantId!;
      const data = await SupplierStatusService.listForQuote(tenantId, id);
      res.json({ success: true, data });
    },
  );

  /**
   * POST /api/quotes/:id/close-total
   * Fecha cotação com vencedor único (modo preço total)
   */
  static closeWithTotalWinner = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { supplierId } = req.body;
    const tenantId = (req as any).user?.tenantId!;

    if (!supplierId) throw createError.badRequest('supplierId é obrigatório');

    await QuoteResultsService.closeWithTotalWinner(tenantId, id, supplierId);

    res.json({ success: true, message: 'Cotação fechada com vencedor único' });
  });

  /**
   * POST /api/quotes/:id/notify-winner
   * Notifica o fornecedor vencedor via WhatsApp (manual)
   */
  static notifyWinner = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tenantId = (req as any).user?.tenantId!;

    const schema = z.object({
      notificationType: z.enum(['selected', 'producer_will_contact']),
    });

    const { notificationType } = schema.parse(req.body);

    const result = await QuoteService.notifyWinner(tenantId, id, notificationType);

    res.json({ success: true, data: result });
  });

  /**
   * POST /api/quotes/:id/close-by-item
   * Fecha cotação com vencedores por item
   */
  static closeWithItemWinners = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const tenantId = (req as any).user?.tenantId!;

    const schema = z.object({
      winners: z.array(z.object({
        quoteItemId: z.string().uuid(),
        supplierId: z.string().uuid(),
      })).min(1),
    });

    const { winners } = schema.parse(req.body);

    await QuoteResultsService.closeWithItemWinners(tenantId, id, winners);

    res.json({ success: true, message: 'Cotação fechada com vencedores por item' });
  });
}
