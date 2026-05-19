import { Request, Response } from 'express';
import { z } from 'zod';
import { PurchaseOrderService } from './purchase-order.service';
import { ErrorHandler } from '../../utils/error-handler';
import { getAuthContext } from '../../utils/auth-context';
import { enqueuePurchaseOrderPdfJob } from '../../jobs/generate-purchase-order-pdf.job';
import { PurchaseOrderNotificationsService } from '../../services/po-notifications.service';
import { logger } from '../../utils/logger';

const closeSchema = z.object({
  mode: z.enum(['winner', 'split']),
  supplierId: z.string().uuid().optional(),
  selections: z.record(z.string().uuid(), z.string().uuid()).optional(),
  reason: z.string().max(500).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listFiltersSchema = z.object({
  status: z.enum(['DRAFT', 'EMITTED', 'CANCELLED']).optional(),
  supplierId: z.string().uuid().optional(),
});

export class PurchaseOrderController {
  /**
   * POST /api/quotes/:id/close-co5
   * CO-5-03 — Fecha a cotação criando 1+ POs.
   * (Endpoint separado do legado PUT /api/quotes/:id/close para evitar quebra.)
   */
  static close = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { id } = req.params;
      const input = closeSchema.parse(req.body);

      const result = await PurchaseOrderService.closeQuote(ctx, id, input);

      // CO-6-02 — Se valor excedeu threshold, criamos Approval em vez de POs.
      // Caller (frontend) deve mostrar tela "aguardando aprovação".
      if (result.requiresApproval) {
        res.json({
          success: true,
          data: {
            requiresApproval: true,
            approvalId: result.approvalId,
            estimatedTotal: result.totalValue,
            threshold: result.threshold,
          },
        });
        return;
      }

      // CO-5-05: enfileira geração do PDF para cada PO (async, não bloqueia resposta)
      for (const po of result.purchaseOrders) {
        try {
          await enqueuePurchaseOrderPdfJob(po.id);
        } catch (err: any) {
          // Bull pode não estar disponível em modo de desenvolvimento — logamos
          // mas não falhamos o close (PO já foi criada em transaction).
          logger.warn('po_pdf_job.enqueue_failed', {
            purchaseOrderId: po.id,
            err: err?.message,
          });
        }
      }

      // CO-5-06 + CO-5-07: notifica vencedor(es) e perdedores em paralelo (fire-and-forget)
      void Promise.all([
        ...result.purchaseOrders.map((po) =>
          PurchaseOrderNotificationsService.notifyWinner(po.id),
        ),
        PurchaseOrderNotificationsService.notifyLosers(id),
      ]).catch((err) => {
        logger.error('po_notifications.failed', { err: err?.message });
      });

      res.json({
        success: true,
        data: {
          purchaseOrderIds: result.purchaseOrders.map((po) => po.id),
          totalValue: result.totalValue,
          purchaseOrders: result.purchaseOrders.map((po) => ({
            id: po.id,
            number: po.number,
            supplierId: po.supplierId,
            totalValue: Number(po.totalValue),
            status: po.status,
          })),
        },
      });
    },
  );

  /**
   * GET /api/purchase-orders
   */
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = listFiltersSchema.parse(req.query);
      const result = await PurchaseOrderService.list(ctx, page, limit, filters);
      res.json({ success: true, ...result });
    },
  );

  /**
   * GET /api/purchase-orders/:id
   */
  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const po = await PurchaseOrderService.getById(ctx, req.params.id);
      res.json({ success: true, data: po });
    },
  );
}
