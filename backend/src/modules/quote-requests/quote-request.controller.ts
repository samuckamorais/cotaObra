import { Request, Response } from 'express';
import { z } from 'zod';
import { QuoteRequestService } from './quote-request.service';
import { ErrorHandler } from '../../utils/error-handler';
import { getAuthContext } from '../../utils/auth-context';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listFiltersSchema = z.object({
  status: z
    .enum(['PENDING_REVIEW', 'PROMOTED', 'REJECTED', 'EXPIRED'])
    .optional(),
  siteId: z.string().uuid().optional(),
});

const promoteSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        qty: z.number().positive(),
        unit: z.string().min(1),
        spec: z.string().optional(),
        materialId: z.string().uuid().optional(),
      }),
    )
    .min(1, 'Informe pelo menos 1 item'),
  region: z.string().optional(),
  deadline: z.coerce.date(),
  observations: z.string().optional(),
  freight: z.enum(['CIF', 'FOB']).optional(),
  paymentTerms: z.string().optional(),
  supplierScope: z.enum(['MINE', 'NETWORK', 'ALL']),
  expiryHours: z.number().int().min(1).max(720).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(3).max(500),
});

export class QuoteRequestController {
  /**
   * GET /api/quote-requests?status=PENDING_REVIEW
   */
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = listFiltersSchema.parse(req.query);
      const result = await QuoteRequestService.list(ctx, page, limit, filters);
      res.json({ success: true, ...result });
    },
  );

  /**
   * GET /api/quote-requests/pending-count
   */
  static pendingCount = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const count = await QuoteRequestService.countPending(ctx);
      res.json({ success: true, data: { count } });
    },
  );

  /**
   * GET /api/quote-requests/:id
   */
  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const qr = await QuoteRequestService.getById(ctx, req.params.id);
      res.json({ success: true, data: qr });
    },
  );

  /**
   * POST /api/quote-requests/:id/promote
   */
  static promote = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const data = promoteSchema.parse(req.body);
      const result = await QuoteRequestService.promote(ctx, req.params.id, data);
      res.json({ success: true, data: result });
    },
  );

  /**
   * POST /api/quote-requests/:id/reject
   */
  static reject = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { reason } = rejectSchema.parse(req.body);
      const qr = await QuoteRequestService.reject(ctx, req.params.id, reason);
      res.json({ success: true, data: qr });
    },
  );
}
