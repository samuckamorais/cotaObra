import { logger } from '../utils/logger';

/**
 * CO-8-04 — Adapter para gateway Asaas (Brasil — PIX/Boleto/Cartão).
 *
 * Quando ASAAS_API_KEY não está no env, opera em STUB (loga + retorna IDs fake).
 * Em produção, plug-in real via fetch para https://api.asaas.com/v3.
 *
 * Endpoints usados:
 *   POST /customers
 *   POST /subscriptions
 *   GET  /subscriptions/{id}
 *   DELETE /subscriptions/{id}
 *
 * Webhook (validação no controller via header `asaas-access-token`):
 *   PAYMENT_CONFIRMED → ativa Subscription
 *   PAYMENT_OVERDUE   → marca quotesUsed=quotesLimit + log warn
 *   SUBSCRIPTION_DELETED → marca active=false
 */

const ASAAS_BASE = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string; // customer id
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  billingType: AsaasBillingType;
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  nextDueDate: string;
  description?: string;
}

const PLAN_PRICE: Record<'BASIC' | 'PRO' | 'ENTERPRISE', number> = {
  BASIC: 149,
  PRO: 499,
  ENTERPRISE: 1499,
};

export class AsaasAdapter {
  private static enabled(): boolean {
    return !!process.env.ASAAS_API_KEY;
  }

  private static async fetch(
    path: string,
    options: { method?: string; body?: any } = {},
  ): Promise<any> {
    const key = process.env.ASAAS_API_KEY;
    if (!key) throw new Error('ASAAS_API_KEY not configured');
    const res = await fetch(`${ASAAS_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        access_token: key,
        'Content-Type': 'application/json',
        'User-Agent': 'CotaObra/1.0',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Asaas ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  /**
   * Cria cliente no Asaas. Retorna `customer.id` (cus_xxx). Em stub
   * gera ID determinístico a partir do CNPJ.
   */
  static async createCustomer(input: {
    name: string;
    cpfCnpj: string;
    email?: string;
    mobilePhone?: string;
  }): Promise<AsaasCustomer> {
    if (!this.enabled()) {
      const fakeId = 'cus_stub_' + Buffer.from(input.cpfCnpj).toString('hex').slice(0, 12);
      logger.info('asaas.stub.customer_create', { fakeId, name: input.name });
      return {
        id: fakeId,
        name: input.name,
        cpfCnpj: input.cpfCnpj,
        email: input.email,
        mobilePhone: input.mobilePhone,
      };
    }
    const created = await this.fetch('/customers', { method: 'POST', body: input });
    return created;
  }

  /**
   * Cria assinatura mensal recorrente. Retorna `subscription`.
   */
  static async createSubscription(input: {
    customer: string;
    plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
    billingType?: AsaasBillingType;
  }): Promise<AsaasSubscription> {
    const value = PLAN_PRICE[input.plan];
    const billingType = input.billingType ?? 'BOLETO';
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 7); // 7 dias pra primeiro pagamento

    if (!this.enabled()) {
      const fakeId = 'sub_stub_' + input.customer.slice(-8);
      logger.info('asaas.stub.subscription_create', {
        fakeId,
        plan: input.plan,
        value,
      });
      return {
        id: fakeId,
        customer: input.customer,
        status: 'ACTIVE',
        billingType,
        value,
        cycle: 'MONTHLY',
        nextDueDate: nextDueDate.toISOString().slice(0, 10),
        description: `CotaObra ${input.plan}`,
      };
    }

    const created = await this.fetch('/subscriptions', {
      method: 'POST',
      body: {
        customer: input.customer,
        billingType,
        value,
        cycle: 'MONTHLY',
        nextDueDate: nextDueDate.toISOString().slice(0, 10),
        description: `CotaObra ${input.plan}`,
      },
    });
    return created;
  }

  /**
   * Retorna URL de checkout/cobrança Asaas pra o subscription (link público
   * que abre a tela de pagamento). Em stub retorna URL fake.
   */
  static getCheckoutUrl(subscriptionId: string): string {
    if (!this.enabled() || subscriptionId.startsWith('sub_stub_')) {
      return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscriptions?checkout=stub&sub=${subscriptionId}`;
    }
    return `https://www.asaas.com/c/${subscriptionId}`;
  }

  /**
   * Cancela assinatura recorrente.
   */
  static async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!this.enabled() || subscriptionId.startsWith('sub_stub_')) {
      logger.info('asaas.stub.subscription_cancel', { subscriptionId });
      return;
    }
    await this.fetch(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }

  /**
   * Valida assinatura do webhook Asaas via header `asaas-access-token`.
   * Asaas envia o mesmo `ASAAS_API_KEY` no header — verificação simples.
   */
  static verifyWebhook(headerToken: string | undefined): boolean {
    const expected = process.env.ASAAS_API_KEY;
    if (!expected) {
      // Em stub aceitamos qualquer requisição (modo dev).
      return true;
    }
    return headerToken === expected;
  }
}
