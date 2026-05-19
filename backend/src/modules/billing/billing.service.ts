import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AsaasAdapter } from '../../services/asaas.adapter';

/**
 * Billing Service — gerenciamento de assinaturas via gateway de pagamento.
 *
 * CO-8-04: usa Asaas (gateway BR PIX/Boleto/CartãoCredito). Quando
 * ASAAS_API_KEY não está configurada, opera em modo stub (sem cobrança real),
 * mas ainda persiste customerId/subscriptionId fakes para reconciliação posterior.
 */
export class BillingService {
  /**
   * Cria customer + subscription Asaas e persiste em `Subscription`.
   * Retorna URL de checkout (link Asaas público).
   *
   * Se já existir Subscription ativa pro tenant, reaproveita ids salvos.
   */
  static async createCheckoutSession(
    tenantId: string,
    plan: 'BASIC' | 'PRO' | 'ENTERPRISE',
  ): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, cnpj: true, email: true },
    });
    if (!tenant) throw new Error('Tenant não encontrado');

    const existing = await prisma.subscription.findFirst({
      where: { tenantId, active: true },
      orderBy: { startDate: 'desc' },
    });

    // Reuse customer se já temos
    let customerId = existing?.asaasCustomerId;
    if (!customerId) {
      const customer = await AsaasAdapter.createCustomer({
        name: tenant.name,
        cpfCnpj: tenant.cnpj ?? '00000000000000',
        email: tenant.email ?? undefined,
      });
      customerId = customer.id;
    }

    const sub = await AsaasAdapter.createSubscription({
      customer: customerId,
      plan,
      billingType: 'BOLETO',
    });

    // Persiste/atualiza Subscription local
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          plan,
          asaasCustomerId: customerId,
          asaasSubscriptionId: sub.id,
          asaasBillingType: sub.billingType,
        },
      });
    } else {
      // Procura producerId (legacy req) ou usa null seguro
      const anyProducer = await prisma.producer.findFirst({
        where: { tenantId },
        select: { id: true },
      });
      if (!anyProducer) {
        logger.warn('billing.no_producer_for_tenant', { tenantId });
      } else {
        await prisma.subscription.upsert({
          where: { producerId: anyProducer.id },
          create: {
            tenantId,
            producerId: anyProducer.id,
            plan,
            quotesLimit: plan === 'BASIC' ? 50 : plan === 'PRO' ? 250 : 9999,
            quotesUsed: 0,
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            active: true,
            asaasCustomerId: customerId,
            asaasSubscriptionId: sub.id,
            asaasBillingType: sub.billingType,
          },
          update: {
            plan,
            active: true,
            asaasCustomerId: customerId,
            asaasSubscriptionId: sub.id,
            asaasBillingType: sub.billingType,
          },
        });
      }
    }

    const checkoutUrl = AsaasAdapter.getCheckoutUrl(sub.id);
    logger.info('billing.checkout_created', { tenantId, plan, subId: sub.id });
    return { checkoutUrl, subscriptionId: sub.id };
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
   * Chama Asaas pra cancelar a recorrência também (se houver subId salvo).
   */
  static async cancelSubscription(tenantId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, active: true },
    });

    if (!subscription) {
      throw new Error('Nenhuma assinatura ativa encontrada');
    }

    if (subscription.asaasSubscriptionId) {
      try {
        await AsaasAdapter.cancelSubscription(subscription.asaasSubscriptionId);
      } catch (err: any) {
        logger.warn('billing.asaas_cancel_failed', {
          tenantId,
          asaasSubscriptionId: subscription.asaasSubscriptionId,
          err: err?.message,
        });
      }
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { active: false },
    });

    logger.info('Subscription canceled', { tenantId, subscriptionId: subscription.id });
  }

  /**
   * Processa evento de webhook do Asaas (CO-8-04).
   *
   * Payload mínimo: { event, payment: { subscription, customer, status } }
   * Eventos suportados:
   *   PAYMENT_CONFIRMED / PAYMENT_RECEIVED → ativa Subscription
   *   PAYMENT_OVERDUE                     → marca quotesUsed=quotesLimit (lock)
   *   PAYMENT_DELETED / SUBSCRIPTION_DELETED → desativa
   */
  static async handleWebhookEvent(
    eventType: string,
    data: Record<string, any>,
  ): Promise<{ handled: boolean }> {
    // Payload Asaas: data pode vir como `{ payment: { subscription, ... } }` ou
    // direto com `subscription`. Suporta também legacy { tenantId } pra
    // compatibilidade com testes antigos.
    const asaasSubId =
      (data.payment?.subscription as string | undefined) ||
      (data.subscription as string | undefined) ||
      (data.id as string | undefined);
    const tenantIdHint = data.tenantId as string | undefined;

    const where = asaasSubId
      ? { asaasSubscriptionId: asaasSubId }
      : tenantIdHint
        ? { tenantId: tenantIdHint }
        : null;

    switch (eventType) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
      case 'invoice.paid': {
        if (where) {
          await prisma.subscription.updateMany({ where, data: { active: true } });
          logger.info('billing.activated', { eventType, where });
        }
        return { handled: true };
      }

      case 'PAYMENT_OVERDUE':
      case 'invoice.payment_failed': {
        logger.warn('billing.payment_overdue', { eventType, where });
        if (where) {
          // Lock soft: ativo=true mas quotesUsed=quotesLimit pra bloquear novas cotações
          const subs = await prisma.subscription.findMany({ where });
          await Promise.all(
            subs.map((s) =>
              prisma.subscription.update({
                where: { id: s.id },
                data: { quotesUsed: s.quotesLimit },
              }),
            ),
          );
        }
        return { handled: true };
      }

      case 'SUBSCRIPTION_DELETED':
      case 'PAYMENT_DELETED':
      case 'customer.subscription.deleted': {
        if (where) {
          await prisma.subscription.updateMany({ where, data: { active: false } });
          logger.info('billing.deleted', { eventType, where });
        }
        return { handled: true };
      }

      default:
        logger.warn('billing.unhandled_event', { eventType });
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
