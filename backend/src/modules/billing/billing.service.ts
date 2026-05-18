import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

/**
 * Billing Service — gerenciamento de assinaturas via gateway de pagamento.
 *
 * Abstrai a integração com Stripe/Mercado Pago. Quando STRIPE_SECRET_KEY
 * não está configurada, opera em modo stub (sem cobrança real).
 */
export class BillingService {
  /**
   * Cria sessão de checkout para o plano selecionado.
   * Retorna URL para redirecionamento ao gateway.
   */
  static async createCheckoutSession(
    tenantId: string,
    plan: 'BASIC' | 'PRO' | 'ENTERPRISE',
  ): Promise<{ checkoutUrl: string }> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      // Modo stub — sem gateway configurado
      logger.warn('STRIPE_SECRET_KEY not configured — returning stub checkout URL');
      return {
        checkoutUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?checkout=stub&plan=${plan}`,
      };
    }

    // TODO: integrar Stripe SDK real
    // const stripe = new Stripe(stripeKey);
    // const session = await stripe.checkout.sessions.create({ ... });
    // return { checkoutUrl: session.url };

    logger.info('Checkout session created', { tenantId, plan });
    return {
      checkoutUrl: `https://checkout.stripe.com/stub/${tenantId}/${plan}`,
    };
  }

  /**
   * Retorna status da assinatura do tenant.
   */
  static async getSubscriptionStatus(tenantId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });

    if (!subscription) {
      return {
        status: 'none',
        plan: null,
        active: false,
      };
    }

    return {
      status: subscription.active ? 'active' : 'canceled',
      plan: subscription.plan,
      active: subscription.active,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
    };
  }

  /**
   * Cancela assinatura ao fim do período atual.
   */
  static async cancelSubscription(tenantId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, active: true },
    });

    if (!subscription) {
      throw new Error('Nenhuma assinatura ativa encontrada');
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { active: false },
    });

    logger.info('Subscription canceled', { tenantId, subscriptionId: subscription.id });
  }

  /**
   * Processa evento de webhook do gateway de pagamento.
   */
  static async handleWebhookEvent(
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<{ handled: boolean }> {
    switch (eventType) {
      case 'invoice.paid': {
        const tenantId = data.tenantId as string;
        if (tenantId) {
          await prisma.subscription.updateMany({
            where: { tenantId },
            data: { active: true },
          });
          logger.info('Subscription activated via webhook', { tenantId });
        }
        return { handled: true };
      }

      case 'invoice.payment_failed': {
        const tenantId = data.tenantId as string;
        if (tenantId) {
          logger.warn('Payment failed', { tenantId });
          // Após 3 falhas: suspender acesso
        }
        return { handled: true };
      }

      case 'customer.subscription.deleted': {
        const tenantId = data.tenantId as string;
        if (tenantId) {
          await prisma.subscription.updateMany({
            where: { tenantId },
            data: { active: false },
          });
          logger.info('Subscription deleted via webhook', { tenantId });
        }
        return { handled: true };
      }

      default:
        logger.warn('Unhandled webhook event', { eventType });
        return { handled: false };
    }
  }

  /**
   * Verifica se o tenant tem assinatura ativa.
   */
  static async hasActiveSubscription(tenantId: string): Promise<boolean> {
    const count = await prisma.subscription.count({
      where: { tenantId, active: true },
    });
    return count > 0;
  }
}
