import { Request, Response } from 'express';
import { z } from 'zod';
import { ApprovalService } from './approval.service';
import { ErrorHandler } from '../../utils/error-handler';
import { getAuthContext } from '../../utils/auth-context';
import { PurchaseOrderService } from '../purchase-orders/purchase-order.service';
import { enqueuePurchaseOrderPdfJob } from '../../jobs/generate-purchase-order-pdf.job';
import { PurchaseOrderNotificationsService } from '../../services/po-notifications.service';
import { logger } from '../../utils/logger';

/**
 * CO-6-02 — REST endpoints para Approval workflow.
 *
 *   GET   /api/approvals?status=PENDING&page&limit
 *   GET   /api/approvals/pending-count
 *   GET   /api/approvals/:id
 *   POST  /api/approvals/:id/approve   → re-aplica closeQuote do payload salvo
 *   POST  /api/approvals/:id/reject    { reason }
 */

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listFiltersSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(5).max(500),
});

export class ApprovalController {
  static list = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { page, limit } = paginationSchema.parse(req.query);
      const filters = listFiltersSchema.parse(req.query);
      const result = await ApprovalService.list(ctx, page, limit, filters);
      res.json({ success: true, ...result });
    },
  );

  static pendingCount = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const count = await ApprovalService.countPending(ctx);
      res.json({ success: true, data: { count } });
    },
  );

  static getById = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const approval = await ApprovalService.getById(ctx, req.params.id);
      res.json({ success: true, data: approval });
    },
  );

  /**
   * Aprovador OK → marca Approval=APPROVED e re-aplica closeQuote do payload
   * armazenado em `closeQuotePayload`. Reusa exatamente a mesma orquestração
   * de PO/PDF/notificações.
   */
  static approve = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { id } = req.params;

      const approval = await ApprovalService.approve(ctx, id);

      // Re-aplica fechamento da quote com o payload salvo
      const payload = (approval as any).closeQuotePayload;
      if (!payload) {
        res.json({ success: true, data: { approvalId: id, action: 'approved' } });
        return;
      }

      try {
        const result = await PurchaseOrderService.closeQuote(
          ctx,
          approval.quoteId,
          payload,
        );

        // Enfileira geração do PDF para cada PO (não bloqueia resposta)
        for (const po of result.purchaseOrders) {
          try {
            await enqueuePurchaseOrderPdfJob(po.id);
          } catch (err: any) {
            logger.warn('po_pdf_job.enqueue_failed', {
              purchaseOrderId: po.id,
              err: err?.message,
            });
          }
        }

        // Notifica vencedor(es) e perdedores (fire-and-forget)
        void Promise.all([
          ...result.purchaseOrders.map((po) =>
            PurchaseOrderNotificationsService.notifyWinner(po.id),
          ),
          PurchaseOrderNotificationsService.notifyLosers(approval.quoteId),
        ]).catch((err) => {
          logger.error('po_notifications.failed', { err: err?.message });
        });

        res.json({
          success: true,
          data: {
            approvalId: id,
            action: 'approved',
            purchaseOrderIds: result.purchaseOrders.map((po) => po.id),
            totalValue: result.totalValue,
          },
        });
      } catch (err: any) {
        logger.error('approval.replay_close_failed', {
          approvalId: id,
          quoteId: approval.quoteId,
          err: err?.message,
        });
        throw err;
      }
    },
  );

  static reject = ErrorHandler.asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = getAuthContext(req);
      const { id } = req.params;
      const { reason } = rejectSchema.parse(req.body);
      const approval = await ApprovalService.reject(ctx, id, reason);
      res.json({
        success: true,
        data: {
          approvalId: approval.id,
          action: 'rejected',
          reason: approval.reason,
        },
      });
    },
  );
}
