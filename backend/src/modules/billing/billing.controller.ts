import { Request, Response } from 'express';
import { ErrorHandler } from '../../utils/error-handler';
import { BillingService } from './billing.service';
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
   * Endpoint público — validação via stripe-signature header.
   */
  static webhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const eventType = req.body?.type;
      const data = req.body?.data?.object || req.body?.data || {};

      const result = await BillingService.handleWebhookEvent(eventType, data);

      res.json({ received: true, handled: result.handled });
    } catch (error) {
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  };
}
