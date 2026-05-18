import {
  buildFirstFollowUp,
  buildSecondFollowUp,
  processFollowUps,
} from '../../../src/jobs/followup-suppliers.job';
import { prisma } from '../../../src/config/database';
import { whatsappService } from '../../../src/modules/whatsapp/whatsapp.service';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    quoteSupplierNotification: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindMany = prisma.quoteSupplierNotification.findMany as jest.Mock;
const mockUpdate = prisma.quoteSupplierNotification.update as jest.Mock;
const mockSendMessage = whatsappService.sendMessage as jest.Mock;

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    quoteId: 'q-1',
    supplierId: 'sup-1',
    followUpCount: 0,
    lastFollowUpAt: null,
    notifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    supplier: { id: 'sup-1', name: 'Fornecedor A', phone: '+5564999999999' },
    quote: {
      id: 'q-1',
      status: 'COLLECTING',
      product: 'Soja',
      deadline: new Date('2026-04-25'),
      producer: { name: 'João Silva' },
      items: [{ product: 'Soja Intacta', quantity: 100, unit: 'sacas' }],
      proposals: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSendMessage.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue({});
});

// ── Templates ─────────────────────────────────────────────────────────────────

describe('buildFirstFollowUp', () => {
  it('gera mensagem amigável com dados corretos', () => {
    const msg = buildFirstFollowUp({
      supplierName: 'Fornecedor A',
      producerName: 'João Silva',
      product: 'Soja Intacta',
      quantity: 100,
      unit: 'sacas',
      deadline: '25/04/2026',
    });

    expect(msg).toContain('Fornecedor A');
    expect(msg).toContain('João Silva');
    expect(msg).toContain('Soja Intacta');
    expect(msg).toContain('100');
    expect(msg).toContain('sacas');
    expect(msg).toContain('25/04/2026');
    expect(msg).toContain('CotaObra');
    expect(msg).not.toContain('Último lembrete');
  });
});

describe('buildSecondFollowUp', () => {
  it('gera mensagem urgente com dados corretos', () => {
    const msg = buildSecondFollowUp({
      supplierName: 'Fornecedor B',
      producerName: 'Ana Oliveira',
      product: 'Fertilizante KCL',
      unit: 'ton',
      deadline: '25/04/2026',
    });

    expect(msg).toContain('Último lembrete');
    expect(msg).toContain('Fornecedor B');
    expect(msg).toContain('Ana Oliveira');
    expect(msg).toContain('Fertilizante KCL');
    expect(msg).toContain('25/04/2026');
    expect(msg).toContain('encerrada automaticamente');
  });
});

// ── processFollowUps ──────────────────────────────────────────────────────────

describe('processFollowUps', () => {
  it('envia 1o follow-up para fornecedor sem resposta após 24h', async () => {
    const notif = makeNotification({ followUpCount: 0 });
    mockFindMany.mockResolvedValue([notif]);

    const result = await processFollowUps();

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+5564999999999',
        body: expect.stringContaining('Fornecedor A'),
      }),
    );
  });

  it('envia 2o follow-up para fornecedor com 1 follow-up e 48h sem resposta', async () => {
    const notif = makeNotification({
      followUpCount: 1,
      lastFollowUpAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });
    mockFindMany.mockResolvedValue([notif]);

    const result = await processFollowUps();

    expect(result.sent).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Último lembrete'),
      }),
    );
  });

  it('atualiza followUpCount e lastFollowUpAt após envio', async () => {
    mockFindMany.mockResolvedValue([makeNotification()]);

    await processFollowUps();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          followUpCount: { increment: 1 },
          lastFollowUpAt: expect.any(Date),
        }),
      }),
    );
  });

  it('NÃO envia follow-up se fornecedor já respondeu (proposta existe)', async () => {
    const notif = makeNotification({
      quote: {
        ...makeNotification().quote,
        proposals: [{ supplierId: 'sup-1' }], // já respondeu
      },
    });
    mockFindMany.mockResolvedValue([notif]);

    const result = await processFollowUps();

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('NÃO envia follow-up se cotação não está COLLECTING', async () => {
    const notif = makeNotification({
      quote: { ...makeNotification().quote, status: 'EXPIRED' },
    });
    mockFindMany.mockResolvedValue([notif]);

    const result = await processFollowUps();

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('processa múltiplos fornecedores sem parar ao encontrar erro', async () => {
    const notif1 = makeNotification({ id: 'n1', supplierId: 'sup-1' });
    const notif2 = makeNotification({
      id: 'n2',
      supplierId: 'sup-2',
      supplier: { id: 'sup-2', name: 'Fornecedor B', phone: '+5511888888888' },
    });

    mockFindMany.mockResolvedValue([notif1, notif2]);
    mockSendMessage
      .mockRejectedValueOnce(new Error('WhatsApp API Error'))
      .mockResolvedValueOnce(undefined);

    const result = await processFollowUps();

    expect(result.errors).toBe(1);
    expect(result.sent).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it('retorna zeros se não há follow-ups pendentes', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await processFollowUps();

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('usa produto do items[0] quando disponível', async () => {
    const notif = makeNotification();
    mockFindMany.mockResolvedValue([notif]);

    await processFollowUps();

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Soja Intacta'),
      }),
    );
  });

  it('usa produto legado (quote.product) quando items vazio', async () => {
    const notif = makeNotification({
      quote: {
        ...makeNotification().quote,
        items: [],
        product: 'Milho Safrinha',
      },
    });
    mockFindMany.mockResolvedValue([notif]);

    await processFollowUps();

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Milho Safrinha'),
      }),
    );
  });
});
