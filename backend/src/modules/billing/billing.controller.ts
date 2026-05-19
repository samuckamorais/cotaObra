import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { BillingService } from './billing.service';
import { AsaasAdapter } from '../../services/asaas.adapter';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
});

export class BillingController {
  /**
   * POST /api/billing/checkout
   */
  static checkout = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { plan } = checkoutSchema.parse(req.body);
    const tenantId = (req as any).user?.tenantId;

    const result = await BillingService.createCheckoutSession(tenantId, plan);

    res.json({ success: true, data: result });
  });

  /**
   * GET /api/billing/subscription
   */
  static getSubscription = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId;

    const status = await BillingService.getSubscriptionStatus(tenantId);

    res.json({ success: true, data: status });
  });

  /**
   * POST /api/billing/cancel
   */
  static cancel = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).user?.tenantId;

    await BillingService.cancelSubscription(tenantId);

    res.json({ success: true, message: 'Assinatura será cancelada ao fim do período atual.' });
  });

  /**
   * POST /api/billing/webhook
   * CO-8-04 — endpoint público. Asaas envia `asaas-access-token` no header.
   * Aceitamos também formato legado (Stripe-like) pra compat com testes.
   */
  static webhook = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validação Asaas: header asaas-access-token === ASAAS_API_KEY
      const headerToken = req.header('asaas-access-token') ?? undefined;
      if (!AsaasAdapter.verifyWebhook(headerToken)) {
        logger.warn('billing.webhook_invalid_token');
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Asaas envia `{ event, payment: {...} }`; fallback pra formato legacy
      const eventType = (req.body?.event ?? req.body?.type) as string | undefined;
      const data =
        req.body?.payment ??
        req.body?.data?.object ??
        req.body?.data ??
        req.body ??
        {};

      if (!eventType) {
        res.status(400).json({ error: 'Missing event type' });
        return;
      }

      const result = await BillingService.handleWebhookEvent(eventType, data);
      res.json({ received: true, handled: result.handled });
    } catch (error: any) {
      logger.error('billing.webhook_failed', { err: error?.message });
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  };
}
