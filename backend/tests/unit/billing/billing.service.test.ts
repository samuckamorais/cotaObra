import { BillingService } from '../../../src/modules/billing/billing.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    subscription: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindFirst = prisma.subscription.findFirst as jest.Mock;
const mockUpdate = prisma.subscription.update as jest.Mock;
const mockUpdateMany = prisma.subscription.updateMany as jest.Mock;
const mockCount = prisma.subscription.count as jest.Mock;

beforeEach(() => jest.resetAllMocks());

// ── createCheckoutSession ─────────────────────────────────────────────────────

describe('BillingService.createCheckoutSession', () => {
  it('retorna URL de checkout para plano BASIC', async () => {
    const result = await BillingService.createCheckoutSession('tenant-1', 'BASIC');
    expect(result.checkoutUrl).toBeTruthy();
    expect(typeof result.checkoutUrl).toBe('string');
  });

  it('retorna URL de checkout para plano PRO', async () => {
    const result = await BillingService.createCheckoutSession('tenant-1', 'PRO');
    expect(result.checkoutUrl).toContain('PRO');
  });

  it('retorna URL de checkout para plano ENTERPRISE', async () => {
    const result = await BillingService.createCheckoutSession('tenant-1', 'ENTERPRISE');
    expect(result.checkoutUrl).toContain('ENTERPRISE');
  });

  it('retorna stub URL quando STRIPE_SECRET_KEY não está configurada', async () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const result = await BillingService.createCheckoutSession('tenant-1', 'BASIC');
    expect(result.checkoutUrl).toContain('stub');

    if (original) process.env.STRIPE_SECRET_KEY = original;
  });
});

// ── getSubscriptionStatus ─────────────────────────────────────────────────────

describe('BillingService.getSubscriptionStatus', () => {
  it('retorna status "none" quando não há assinatura', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await BillingService.getSubscriptionStatus('tenant-1');

    expect(result.status).toBe('none');
    expect(result.plan).toBeNull();
    expect(result.active).toBe(false);
  });

  it('retorna "active" para assinatura ativa', async () => {
    mockFindFirst.mockResolvedValue({
      plan: 'PRO', active: true,
      startDate: new Date(), endDate: new Date(),
    });

    const result = await BillingService.getSubscriptionStatus('tenant-1');

    expect(result.status).toBe('active');
    expect(result.plan).toBe('PRO');
    expect(result.active).toBe(true);
  });

  it('retorna "canceled" para assinatura inativa', async () => {
    mockFindFirst.mockResolvedValue({
      plan: 'BASIC', active: false,
      startDate: new Date(), endDate: new Date(),
    });

    const result = await BillingService.getSubscriptionStatus('tenant-1');

    expect(result.status).toBe('canceled');
    expect(result.active).toBe(false);
  });

  it('busca assinatura por tenantId', async () => {
    mockFindFirst.mockResolvedValue(null);

    await BillingService.getSubscriptionStatus('tenant-xyz');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-xyz' },
      }),
    );
  });
});

// ── cancelSubscription ────────────────────────────────────────────────────────

describe('BillingService.cancelSubscription', () => {
  it('desativa assinatura ativa', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sub-1', active: true });
    mockUpdate.mockResolvedValue({});

    await BillingService.cancelSubscription('tenant-1');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { active: false },
      }),
    );
  });

  it('lança erro quando não há assinatura ativa', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(BillingService.cancelSubscription('tenant-1'))
      .rejects.toThrow('Nenhuma assinatura ativa encontrada');
  });
});

// ── handleWebhookEvent ────────────────────────────────────────────────────────

describe('BillingService.handleWebhookEvent', () => {
  it('invoice.paid: ativa assinatura do tenant', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await BillingService.handleWebhookEvent('invoice.paid', { tenantId: 'tenant-1' });

    expect(result.handled).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        data: { active: true },
      }),
    );
  });

  it('invoice.payment_failed: marca como handled e loga warning', async () => {
    const result = await BillingService.handleWebhookEvent('invoice.payment_failed', { tenantId: 'tenant-1' });

    expect(result.handled).toBe(true);
  });

  it('customer.subscription.deleted: desativa assinatura', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await BillingService.handleWebhookEvent('customer.subscription.deleted', { tenantId: 'tenant-1' });

    expect(result.handled).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        data: { active: false },
      }),
    );
  });

  it('evento desconhecido: retorna handled=false', async () => {
    const result = await BillingService.handleWebhookEvent('unknown.event', {});

    expect(result.handled).toBe(false);
  });

  it('invoice.paid sem tenantId: não atualiza nada', async () => {
    const result = await BillingService.handleWebhookEvent('invoice.paid', {});

    expect(result.handled).toBe(true);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ── hasActiveSubscription ─────────────────────────────────────────────────────

describe('BillingService.hasActiveSubscription', () => {
  it('retorna true quando há assinatura ativa', async () => {
    mockCount.mockResolvedValue(1);

    const result = await BillingService.hasActiveSubscription('tenant-1');

    expect(result).toBe(true);
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', active: true },
      }),
    );
  });

  it('retorna false quando não há assinatura ativa', async () => {
    mockCount.mockResolvedValue(0);

    const result = await BillingService.hasActiveSubscription('tenant-1');

    expect(result).toBe(false);
  });
});
