import { QuoteService } from '../../../src/modules/quotes/quote.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    subscription: { findFirst: jest.fn() },
    quote: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), count: jest.fn(), update: jest.fn() },
    producer: { findFirst: jest.fn() },
    proposal: { findFirst: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/jobs/dispatch-quote.job', () => ({
  dispatchQuoteJob: jest.fn().mockResolvedValue(5),
}));

jest.mock('../../../src/services/producer-settings.service', () => ({
  ProducerSettingsService: {
    getOrCreate: jest.fn().mockResolvedValue({ quoteExpiryHours: 2 }),
  },
}));

jest.mock('../../../src/services/analytics.service', () => ({
  analyticsService: { trackEvent: jest.fn() },
}));

const mockFindSubscription = prisma.subscription.findFirst as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockFindSubscription.mockResolvedValue(null);
});

describe('QuoteService.getSupplierLimit', () => {
  it('retorna limite 5 para plano BASIC', async () => {
    mockFindSubscription.mockResolvedValue({ plan: 'BASIC', active: true });

    const result = await QuoteService.getSupplierLimit('prod-1');

    expect(result.plan).toBe('BASIC');
    expect(result.suppliersPerQuote).toBe(5);
    expect(result.upgradeTo).toBe('PRO');
  });

  it('retorna limite 10 para plano PRO', async () => {
    mockFindSubscription.mockResolvedValue({ plan: 'PRO', active: true });

    const result = await QuoteService.getSupplierLimit('prod-1');

    expect(result.plan).toBe('PRO');
    expect(result.suppliersPerQuote).toBe(10);
    expect(result.upgradeTo).toBe('ENTERPRISE');
  });

  it('retorna null (ilimitado) para plano ENTERPRISE', async () => {
    mockFindSubscription.mockResolvedValue({ plan: 'ENTERPRISE', active: true });

    const result = await QuoteService.getSupplierLimit('prod-1');

    expect(result.plan).toBe('ENTERPRISE');
    expect(result.suppliersPerQuote).toBeNull();
    expect(result.upgradeTo).toBeNull();
  });

  it('fallback para BASIC quando não há subscription ativa', async () => {
    mockFindSubscription.mockResolvedValue(null);

    const result = await QuoteService.getSupplierLimit('prod-sem-sub');

    expect(result.plan).toBe('BASIC');
    expect(result.suppliersPerQuote).toBe(5);
    expect(result.upgradeTo).toBe('PRO');
  });

  it('busca subscription com producerId e active: true', async () => {
    mockFindSubscription.mockResolvedValue({ plan: 'PRO', active: true });

    await QuoteService.getSupplierLimit('prod-xyz');

    expect(mockFindSubscription).toHaveBeenCalledWith({
      where: { producerId: 'prod-xyz', active: true },
    });
  });
});
