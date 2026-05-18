import { QuoteService } from '../../../src/modules/quotes/quote.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    quote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    producer: { findFirst: jest.fn() },
    proposal: { findFirst: jest.fn() },
    subscription: { update: jest.fn() },
  },
}));

jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn().mockResolvedValue(undefined) },
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

jest.mock('../../../src/flows/messages', () => ({
  Messages: {
    PROPOSAL_SELECTED: jest.fn().mockReturnValue('Você foi selecionado!'),
    QUOTE_CLOSED_PRODUCER_CONTACTS: jest.fn().mockReturnValue('O produtor entrará em contato'),
  },
}));

const TENANT = 'tenant-abc';

beforeEach(() => jest.clearAllMocks());

describe('QuoteService', () => {
  describe('create', () => {
    it('cria cotação com status PENDING e calcula expiresAt', async () => {
      (prisma.producer.findFirst as jest.Mock).mockResolvedValue({
        id: 'prod-1', tenantId: TENANT,
        subscription: { id: 'sub-1', quotesUsed: 0, quotesLimit: 100 },
      });
      (prisma.quote.create as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'PENDING', producerId: 'prod-1',
      });
      (prisma.subscription.update as jest.Mock).mockResolvedValue({});

      const result = await QuoteService.create(TENANT, {
        producerId: 'prod-1',
        product: 'Soja',
        quantity: '500',
        unit: 'sacas',
        region: 'GO',
        deadline: new Date('2026-04-20'),
        supplierScope: 'ALL',
      });

      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', tenantId: TENANT }),
        }),
      );
      expect(prisma.subscription.update).toHaveBeenCalled();
      expect(result.id).toBe('q-1');
    });

    it('lança erro se produtor não existe', async () => {
      (prisma.producer.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        QuoteService.create(TENANT, {
          producerId: 'inexistente',
          product: 'Soja', quantity: '1', unit: 'kg',
          region: 'GO', deadline: new Date(), supplierScope: 'ALL',
        }),
      ).rejects.toThrow('Produtor não encontrado');
    });

    it('lança erro se quota excedida', async () => {
      (prisma.producer.findFirst as jest.Mock).mockResolvedValue({
        id: 'prod-1', tenantId: TENANT,
        subscription: { id: 'sub-1', quotesUsed: 100, quotesLimit: 100 },
      });
      await expect(
        QuoteService.create(TENANT, {
          producerId: 'prod-1',
          product: 'Soja', quantity: '1', unit: 'kg',
          region: 'GO', deadline: new Date(), supplierScope: 'ALL',
        }),
      ).rejects.toThrow(/[Ll]imite/);
    });
  });

  describe('dispatch', () => {
    it('dispara cotação PENDING e retorna contagem de fornecedores', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'PENDING', tenantId: TENANT,
        producer: {}, proposals: [],
      });

      const result = await QuoteService.dispatch(TENANT, 'q-1');
      expect(result.suppliersCount).toBe(5);
    });

    it('lança erro se cotação já foi disparada', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'COLLECTING', tenantId: TENANT,
        producer: {}, proposals: [],
      });
      await expect(QuoteService.dispatch(TENANT, 'q-1')).rejects.toThrow('já foi disparada');
    });
  });

  describe('close', () => {
    it('fecha cotação SUMMARIZED com fornecedor válido', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'SUMMARIZED', tenantId: TENANT,
        producer: {}, proposals: [],
      });
      (prisma.proposal.findFirst as jest.Mock).mockResolvedValue({
        id: 'prop-1', supplierId: 'sup-1',
        supplier: { name: 'Fornecedor A' },
      });
      (prisma.quote.update as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'CLOSED', closedSupplierId: 'sup-1',
        producer: {}, proposals: [],
      });

      const result = await QuoteService.close(TENANT, 'q-1', 'sup-1');
      expect(result.status).toBe('CLOSED');
      expect(result.closedSupplierId).toBe('sup-1');
    });

    it('lança erro se cotação já está fechada', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'CLOSED', tenantId: TENANT,
        producer: {}, proposals: [],
      });
      await expect(QuoteService.close(TENANT, 'q-1', 'sup-1')).rejects.toThrow('já está fechada');
    });

    it('lança erro se cotação não está consolidada', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'COLLECTING', tenantId: TENANT,
        producer: {}, proposals: [],
      });
      await expect(QuoteService.close(TENANT, 'q-1', 'sup-1')).rejects.toThrow('consolidada');
    });

    it('lança erro se fornecedor não tem proposta', async () => {
      (prisma.quote.findFirst as jest.Mock).mockResolvedValue({
        id: 'q-1', status: 'SUMMARIZED', tenantId: TENANT,
        producer: {}, proposals: [],
      });
      (prisma.proposal.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(QuoteService.close(TENANT, 'q-1', 'sup-1')).rejects.toThrow('não tem proposta');
    });
  });

  describe('getStats', () => {
    it('retorna estatísticas agregadas', async () => {
      (prisma.quote.count as jest.Mock)
        .mockResolvedValueOnce(50)  // total
        .mockResolvedValueOnce(5)   // pending
        .mockResolvedValueOnce(10)  // collecting
        .mockResolvedValueOnce(30)  // closed
        .mockResolvedValueOnce(5)   // expired
        .mockResolvedValueOnce(3);  // today

      const stats = await QuoteService.getStats(TENANT);
      expect(stats.totalQuotes).toBe(50);
      expect(stats.closedQuotes).toBe(30);
      expect(stats.closureRate).toBe('60.00');
    });
  });
});
