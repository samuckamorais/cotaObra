import {
  QuoteFormService,
  QuoteFormSupplierConflictError,
  QuoteFormValidationError,
} from '../../../src/modules/quote-form/quote-form.service';
import { QuoteTokenService } from '../../../src/services/quote-token.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/services/quote-token.service');
jest.mock('../../../src/config/database', () => ({
  prisma: {
    supplier: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    producerSupplier: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    quote: { create: jest.fn() },
    quoteItem: { createMany: jest.fn() },
    subscription: { updateMany: jest.fn() },
    producer: { update: jest.fn() },
    conversationState: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Cortar dependências indiretas (whatsapp / FSMs / jobs) que o module-under-test
// puxa via imports — irrelevantes para createSupplier
jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn() },
}));
jest.mock('../../../src/jobs/dispatch-quote.job', () => ({
  dispatchQuoteJob: jest.fn(),
}));
jest.mock('../../../src/services/producer-settings.service', () => ({
  ProducerSettingsService: { getOrCreate: jest.fn() },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logWithContext: jest.fn(),
}));

const mockValidate = QuoteTokenService.validate as jest.Mock;
const mockSupplierFindFirst = prisma.supplier.findFirst as unknown as jest.Mock;
const mockSupplierCreate = prisma.supplier.create as unknown as jest.Mock;
const mockSupplierUpdate = prisma.supplier.update as unknown as jest.Mock;
const mockProducerSupplierFindFirst = prisma.producerSupplier.findFirst as unknown as jest.Mock;
const mockProducerSupplierCreate = prisma.producerSupplier.create as unknown as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;

const PRODUCER = {
  id: 'p-1',
  name: 'João',
  phone: '+5564999990001',
  city: 'Rio Verde',
  region: 'GO',
  tenantId: 't-1',
};

const TOKEN_RECORD = {
  token: 'tok123',
  producer: PRODUCER,
  expiresAt: new Date(Date.now() + 2 * 3_600_000),
  used: false,
  cancelled: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue(TOKEN_RECORD);
  mockSupplierFindFirst.mockResolvedValue(null);
  mockProducerSupplierFindFirst.mockResolvedValue(null);
  mockProducerSupplierCreate.mockResolvedValue({});
  mockSupplierCreate.mockResolvedValue({
    id: 's-new', name: 'Novo Forn', phone: '64999990000',
    tenantId: 't-1', isNetworkSupplier: false, categories: ['sementes'], regions: ['GO'],
  });
  // $transaction executa o callback recebido com prisma como tx
  mockTransaction.mockImplementation(async (fn: any) => fn(prisma));
});

describe('QuoteFormService.createSupplier', () => {
  describe('validação', () => {
    it('rejeita nome vazio', async () => {
      await expect(
        QuoteFormService.createSupplier('tok123', { name: '', phone: '64999990000' }),
      ).rejects.toBeInstanceOf(QuoteFormValidationError);
    });

    it('rejeita nome com 1 caractere', async () => {
      await expect(
        QuoteFormService.createSupplier('tok123', { name: 'A', phone: '64999990000' }),
      ).rejects.toBeInstanceOf(QuoteFormValidationError);
    });

    it('rejeita telefone com letras', async () => {
      await expect(
        QuoteFormService.createSupplier('tok123', { name: 'Forn', phone: 'abc123' }),
      ).rejects.toBeInstanceOf(QuoteFormValidationError);
    });

    it('rejeita telefone com menos de 10 dígitos', async () => {
      await expect(
        QuoteFormService.createSupplier('tok123', { name: 'Forn', phone: '999' }),
      ).rejects.toBeInstanceOf(QuoteFormValidationError);
    });

    it('aceita telefone com formatação (espaços, traço, parênteses)', async () => {
      const result = await QuoteFormService.createSupplier('tok123', {
        name: 'Forn', phone: '(64) 99999-0000', category: 'sementes',
      });
      expect(result.isOwn).toBe(true);
      // O telefone foi normalizado antes de criar
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: '64999990000' }) }),
      );
    });
  });

  describe('criação de novo fornecedor', () => {
    it('cria supplier + producerSupplier em transação atômica com categoria herdada (normalizada)', async () => {
      const result = await QuoteFormService.createSupplier('tok123', {
        name: 'João Silva',
        phone: '64999990000',
        category: 'sementes', // FF-BE-025: input plural é normalizado para "semente"
      });

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'João Silva',
            phone: '64999990000',
            tenantId: 't-1',
            isNetworkSupplier: false,
            categories: ['semente'], // value canônico, não label plural
            regions: ['GO'],
          }),
        }),
      );
      expect(mockProducerSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            producerId: 'p-1',
            supplierId: 's-new',
            tenantId: 't-1',
          }),
        }),
      );
      expect(result.isOwn).toBe(true);
    });

    it('sem categoria, supplier criado com categories=[]', async () => {
      mockSupplierCreate.mockResolvedValue({
        id: 's-new', name: 'Sem cat', phone: '64999990000', categories: [],
      });
      await QuoteFormService.createSupplier('tok123', {
        name: 'Sem cat',
        phone: '64999990000',
      });
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categories: [] }) }),
      );
    });
  });

  describe('duplicidade', () => {
    it('lança QuoteFormSupplierConflictError quando phone+tenant já vinculado ao produtor', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        id: 's-existing', name: 'Já existe', phone: '64999990000', categories: ['sementes'],
      });
      mockProducerSupplierFindFirst.mockResolvedValue({ id: 'ps-1' });

      await expect(
        QuoteFormService.createSupplier('tok123', {
          name: 'Tentativa',
          phone: '64999990000',
        }),
      ).rejects.toBeInstanceOf(QuoteFormSupplierConflictError);

      expect(mockSupplierCreate).not.toHaveBeenCalled();
    });

    it('quando supplier existe no tenant mas não vinculado a esse produtor → vincula sem criar', async () => {
      mockSupplierFindFirst.mockResolvedValue({
        id: 's-existing', name: 'Já existe', phone: '64999990000', categories: ['outra'],
      });
      mockProducerSupplierFindFirst.mockResolvedValue(null);
      mockSupplierUpdate.mockResolvedValue({
        id: 's-existing', name: 'Já existe', categories: ['outra', 'sementes'],
      });

      const result = await QuoteFormService.createSupplier('tok123', {
        name: 'Tentativa',
        phone: '64999990000',
        category: 'sementes',
      });

      expect(mockSupplierCreate).not.toHaveBeenCalled();
      expect(mockProducerSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supplierId: 's-existing', producerId: 'p-1' }),
        }),
      );
      // FF-BE-025: push usa value canônico ("semente"), não o input bruto ("sementes")
      expect(mockSupplierUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categories: { push: 'semente' } }),
        }),
      );
      expect(result.isOwn).toBe(true);
    });
  });

  describe('FF-BE-025 — normalização de category', () => {
    it('aceita value canônico direto sem mudança', async () => {
      await QuoteFormService.createSupplier('tok123', {
        name: 'Forn', phone: '64999990000', category: 'defensivo',
      });
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categories: ['defensivo'] }),
        }),
      );
    });

    it('normaliza plural antigo "Defensivos" → "defensivo"', async () => {
      await QuoteFormService.createSupplier('tok123', {
        name: 'Forn', phone: '64999990000', category: 'Defensivos',
      });
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categories: ['defensivo'] }),
        }),
      );
    });

    it('normaliza variação sem acento "calcario" → "calcario" (canônico)', async () => {
      await QuoteFormService.createSupplier('tok123', {
        name: 'Forn', phone: '64999990000', category: 'Calcário',
      });
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categories: ['calcario'] }),
        }),
      );
    });

    it('rejeita category fora do dicionário com QuoteFormValidationError', async () => {
      await expect(
        QuoteFormService.createSupplier('tok123', {
          name: 'Forn', phone: '64999990000', category: 'Rações', // não existe mais
        }),
      ).rejects.toBeInstanceOf(QuoteFormValidationError);
      expect(mockSupplierCreate).not.toHaveBeenCalled();
    });

    it('category undefined permite cadastro sem categoria', async () => {
      await QuoteFormService.createSupplier('tok123', {
        name: 'Forn', phone: '64999990000',
      });
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categories: [] }),
        }),
      );
    });
  });

  describe('autenticação por token', () => {
    it('propaga erro de token inválido', async () => {
      mockValidate.mockRejectedValue(new Error('TOKEN_NOT_FOUND'));
      await expect(
        QuoteFormService.createSupplier('bad', { name: 'X', phone: '64999990000' }),
      ).rejects.toThrow('TOKEN_NOT_FOUND');
    });

    it('propaga erro de token expirado', async () => {
      mockValidate.mockRejectedValue(new Error('TOKEN_EXPIRED'));
      await expect(
        QuoteFormService.createSupplier('expired', { name: 'X', phone: '64999990000' }),
      ).rejects.toThrow('TOKEN_EXPIRED');
    });
  });

  describe('isolamento multi-tenant', () => {
    it('busca duplicidade filtrando por tenantId do produtor (do token)', async () => {
      await QuoteFormService.createSupplier('tok123', {
        name: 'Forn',
        phone: '64999990000',
      });
      expect(mockSupplierFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 't-1' }),
        }),
      );
    });
  });
});

describe('QuoteFormService.submitForm — FF-BE-025 normalização de category', () => {
  const mockQuoteCreate = prisma.quote.create as unknown as jest.Mock;
  const ProducerSettings = require('../../../src/services/producer-settings.service').ProducerSettingsService;
  const dispatchJob = require('../../../src/jobs/dispatch-quote.job').dispatchQuoteJob;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockResolvedValue(TOKEN_RECORD);
    (ProducerSettings.getOrCreate as jest.Mock).mockResolvedValue({ quoteExpiryHours: 2 });
    (dispatchJob as jest.Mock).mockResolvedValue(3);
    mockTransaction.mockImplementation(async (fn: any) => fn(prisma));
    mockQuoteCreate.mockResolvedValue({ id: 'q-1' });
    (prisma.quoteItem.createMany as jest.Mock).mockResolvedValue({});
    (prisma.subscription.updateMany as jest.Mock).mockResolvedValue({});
    (prisma.producer.update as jest.Mock).mockResolvedValue({});
    (prisma.conversationState.updateMany as jest.Mock).mockResolvedValue({});
  });

  const baseSubmit = {
    items: [{ product: 'Soja', quantity: 100, unit: 'sacas' }],
    region: 'Rio Verde',
    deadline: '2026-06-01',
    freight: 'CIF' as const,
    paymentTerms: '30',
    selectedSupplierIds: ['s-1'],
  };

  it('Cenário 2 — submete value canônico, persiste value canônico', async () => {
    await QuoteFormService.submitForm('tok123', { ...baseSubmit, category: 'defensivo' });

    expect(mockQuoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'defensivo' }),
      }),
    );
  });

  it('Cenário 7a — cliente antigo envia "Sementes", backend normaliza para "semente"', async () => {
    await QuoteFormService.submitForm('tok123', { ...baseSubmit, category: 'Sementes' });

    expect(mockQuoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'semente' }),
      }),
    );
  });

  it('Cenário 7b — category fora do dicionário → 400 (QuoteFormValidationError)', async () => {
    await expect(
      QuoteFormService.submitForm('tok123', { ...baseSubmit, category: 'xyz' }),
    ).rejects.toBeInstanceOf(QuoteFormValidationError);

    expect(mockQuoteCreate).not.toHaveBeenCalled();
  });

  it('preferências do produtor (lastQuotePreferences) gravam category canônico', async () => {
    await QuoteFormService.submitForm('tok123', { ...baseSubmit, category: 'Defensivos' });

    expect((prisma.producer.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastQuotePreferences: expect.objectContaining({ category: 'defensivo' }),
        }),
      }),
    );
  });
});
