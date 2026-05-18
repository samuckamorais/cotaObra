/**
 * Teste de integração: ciclo de vida da cotação
 * PENDING → COLLECTING → SUMMARIZED → CLOSED
 *
 * Usa mocks de banco e WhatsApp para simular o fluxo completo
 * sem dependências externas.
 */
import { QuoteService } from '../../src/modules/quotes/quote.service';
import { consolidateQuote } from '../../src/jobs/consolidate-quote.job';
import { prisma } from '../../src/config/database';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';

jest.mock('../../src/config/database', () => ({
  prisma: {
    quote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    producer: { findFirst: jest.fn() },
    proposal: { findFirst: jest.fn() },
    subscription: { update: jest.fn() },
    conversationState: { update: jest.fn() },
  },
}));

jest.mock('../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logWithContext: jest.fn(),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'test_jwt_secret_with_at_least_32_chars',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '90d',
  },
}));

jest.mock('../../src/jobs/dispatch-quote.job', () => ({
  dispatchQuoteJob: jest.fn().mockResolvedValue(3),
}));

jest.mock('../../src/services/producer-settings.service', () => ({
  ProducerSettingsService: {
    getOrCreate: jest.fn().mockResolvedValue({ quoteExpiryHours: 2 }),
  },
}));

jest.mock('../../src/services/job-lock.service', () => ({
  JobLockService: {
    acquire: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/flows/messages', () => ({
  Messages: {
    QUOTE_SUMMARY: jest.fn().mockReturnValue('Resumo das propostas'),
    QUOTE_EXPIRED_SUPPLIER: jest.fn().mockReturnValue('Cotação expirada'),
    PROPOSAL_SELECTED: jest.fn().mockReturnValue('Você foi selecionado!'),
    QUOTE_CLOSED_PRODUCER_CONTACTS: jest.fn().mockReturnValue('Produtor vai contatar'),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('Quote Lifecycle Integration', () => {
  const TENANT = 'tenant-1';
  const PRODUCER_ID = 'prod-1';
  const SUPPLIER_ID = 'sup-1';

  it('fluxo completo: PENDING → dispatch → COLLECTING → consolidate → SUMMARIZED → close → CLOSED', async () => {
    // 1. Create quote
    (prisma.producer.findFirst as jest.Mock).mockResolvedValue({
      id: PRODUCER_ID, tenantId: TENANT,
      subscription: { id: 'sub-1', quotesUsed: 0, quotesLimit: 100 },
    });
    (prisma.quote.create as jest.Mock).mockResolvedValue({
      id: 'q-1', status: 'PENDING', producerId: PRODUCER_ID,
    });
    (prisma.subscription.update as jest.Mock).mockResolvedValue({});

    const created = await QuoteService.create(TENANT, {
      producerId: PRODUCER_ID, product: 'Soja', quantity: '500',
      unit: 'sacas', region: 'GO', deadline: new Date('2026-04-20'),
      supplierScope: 'ALL',
    });
    expect(created.status).toBe('PENDING');

    // 2. Dispatch (mocked to return 3 suppliers)
    (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
      id: 'q-1', status: 'PENDING', tenantId: TENANT,
      producer: {}, proposals: [],
    });
    const dispatched = await QuoteService.dispatch(TENANT, 'q-1');
    expect(dispatched.suppliersCount).toBe(3);

    // 3. Consolidate (with 1 proposal)
    (prisma.quote.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'q-1', status: 'COLLECTING', tenantId: TENANT,
      producerId: PRODUCER_ID,
      product: 'Soja',
      items: [{ id: 'qi-1', product: 'Soja', quantity: 500, unit: 'sacas' }],
      producer: { phone: '+5564999999999', name: 'João' },
      proposals: [{
        id: 'prop-1', supplierId: SUPPLIER_ID, price: 15000, totalPrice: 15000,
        deliveryDays: 5, paymentTerms: '30 dias', isOwnSupplier: false,
        observations: null,
        items: [],
        supplier: { name: 'Fornecedor A', phone: '+5511999999999', rating: 4.0 },
      }],
      supplierNotifications: [],
    });
    (prisma.quote.update as jest.Mock).mockResolvedValue({ status: 'SUMMARIZED' });
    (prisma.conversationState.update as jest.Mock).mockResolvedValue({});

    await consolidateQuote('q-1');

    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUMMARIZED' }),
      }),
    );
    expect(whatsappService.sendMessage).toHaveBeenCalled();

    // 4. Close
    (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
      id: 'q-1', status: 'SUMMARIZED', tenantId: TENANT,
      producer: {}, proposals: [],
    });
    (prisma.proposal.findFirst as jest.Mock).mockResolvedValue({
      id: 'prop-1', supplierId: SUPPLIER_ID,
      supplier: { name: 'Fornecedor A' },
    });
    (prisma.quote.update as jest.Mock).mockResolvedValue({
      id: 'q-1', status: 'CLOSED', closedSupplierId: SUPPLIER_ID,
      producer: {}, proposals: [],
    });

    const closed = await QuoteService.close(TENANT, 'q-1', SUPPLIER_ID);
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedSupplierId).toBe(SUPPLIER_ID);
  });

  it('cotação sem propostas: COLLECTING → EXPIRED', async () => {
    (prisma.quote.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'q-2', status: 'COLLECTING', tenantId: TENANT,
      producerId: PRODUCER_ID,
      product: 'Milho',
      producer: { phone: '+5564999999999', name: 'João' },
      proposals: [],
      supplierNotifications: [
        { supplierId: 'sup-1', supplier: { phone: '+5511999999999' } },
      ],
    });
    (prisma.quote.update as jest.Mock).mockResolvedValue({ status: 'EXPIRED' });

    await consolidateQuote('q-2');

    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
  });

  it('notifica fornecedores que não responderam durante consolidação', async () => {
    (prisma.quote.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'q-3', status: 'COLLECTING', tenantId: TENANT,
      producerId: PRODUCER_ID,
      product: 'Soja',
      items: [{ id: 'qi-1', product: 'Soja', quantity: 500, unit: 'sacas' }],
      producer: { phone: '+5564999999999', name: 'João' },
      proposals: [{ supplierId: 'sup-1', price: 10000, totalPrice: 10000, deliveryDays: 3, paymentTerms: '30d', isOwnSupplier: false, observations: null, items: [], supplier: { name: 'A', phone: '+5511111111111', rating: 3.5 } }],
      supplierNotifications: [
        { supplierId: 'sup-1', supplier: { phone: '+5511111111111' } },
        { supplierId: 'sup-2', supplier: { phone: '+5522222222222' } },
      ],
    });
    (prisma.quote.update as jest.Mock).mockResolvedValue({});
    (prisma.conversationState.update as jest.Mock).mockResolvedValue({});

    await consolidateQuote('q-3');

    // sup-2 não respondeu — deve ser notificado
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+5522222222222' }),
    );
  });
});
