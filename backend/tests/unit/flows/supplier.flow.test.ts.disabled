import { SupplierFSM } from '../../../src/flows/supplier.flow';
import { whatsappService } from '../../../src/modules/whatsapp/whatsapp.service';
import { prisma } from '../../../src/config/database';
import { Messages } from '../../../src/flows/messages';
import { SupplierStateService } from '../../../src/services/supplier-state.service';

jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/config/database', () => ({
  prisma: {
    supplier: { findUniqueOrThrow: jest.fn() },
    quote: { findUniqueOrThrow: jest.fn() },
    proposal: { create: jest.fn() },
    proposalItem: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/services/supplier-state.service', () => ({
  SupplierStateService: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logWithContext: jest.fn(),
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: { trackEvent: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/services/supplier-notification.service', () => ({
  supplierNotificationService: { sendProposalRankingFeedback: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/services/producer-settings.service', () => ({
  ProducerSettingsService: {
    getOrCreate: jest.fn().mockResolvedValue({ proposalLinkExpiryHours: 24 }),
  },
}));

jest.mock('../../../src/services/proposal-token.service', () => ({
  ProposalTokenService: {
    generateFormUrl: jest.fn().mockResolvedValue('https://example.com/p/test'),
  },
}));

const mockSendMessage = whatsappService.sendMessage as jest.Mock;
const mockGetState = SupplierStateService.get as jest.Mock;
const mockSetState = SupplierStateService.set as jest.Mock;
const mockDeleteState = SupplierStateService.delete as jest.Mock;

const SUPPLIER_ID = 'sup-123';
const PHONE = '+5511999999999';

function mockSupplier() {
  (prisma.supplier.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    id: SUPPLIER_ID, phone: PHONE, tenantId: 'tenant-1',
  });
}

let fsm: SupplierFSM;

beforeEach(() => {
  jest.clearAllMocks();
  fsm = new SupplierFSM();
  mockSupplier();
});

describe('SupplierFSM', () => {
  describe('SUPPLIER_IDLE', () => {
    it('informa que receberá notificações', async () => {
      mockGetState.mockResolvedValue(null);
      await fsm.handleMessage(SUPPLIER_ID, 'olá');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('notificações') }),
      );
    });
  });

  describe('SUPPLIER_AWAITING_RESPONSE', () => {
    it('opção 1 aceita cotação e avança para AWAITING_PRICE', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_RESPONSE',
        context: { quoteId: 'q-1', quoteItems: [{ id: 'qi-1', product: 'Soja', quantity: 100, unit: 'sacas' }] },
      });
      await fsm.handleMessage(SUPPLIER_ID, '1');
      expect(mockSetState).toHaveBeenCalledWith(
        SUPPLIER_ID, 'SUPPLIER_AWAITING_PRICE', expect.any(Object),
      );
    });

    it('opção 2 recusa cotação e limpa estado', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_RESPONSE',
        context: { quoteId: 'q-1' },
      });
      await fsm.handleMessage(SUPPLIER_ID, '2');
      expect(mockDeleteState).toHaveBeenCalledWith(SUPPLIER_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: Messages.PROPOSAL_DECLINED }),
      );
    });

    it('opção inválida pede nova entrada', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_RESPONSE',
        context: { quoteId: 'q-1' },
      });
      await fsm.handleMessage(SUPPLIER_ID, '3');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('inválida') }),
      );
    });
  });

  describe('SUPPLIER_AWAITING_PRICE', () => {
    it('aceita preço válido e avança para AWAITING_DELIVERY', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_PRICE',
        context: { quoteId: 'q-1', quoteItems: [{ id: 'qi-1', product: 'Soja', quantity: 100, unit: 'sacas' }] },
      });
      await fsm.handleMessage(SUPPLIER_ID, '15000');
      expect(mockSetState).toHaveBeenCalledWith(
        SUPPLIER_ID, 'SUPPLIER_AWAITING_DELIVERY', expect.objectContaining({ price: 15000 }),
      );
    });

    it('rejeita preço inválido (texto)', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_PRICE',
        context: { quoteId: 'q-1', quoteItems: [] },
      });
      await fsm.handleMessage(SUPPLIER_ID, 'abc');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('inválido') }),
      );
    });
  });

  describe('SUPPLIER_AWAITING_DELIVERY', () => {
    it('aceita prazo válido e avança para AWAITING_PAYMENT', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_DELIVERY',
        context: { quoteId: 'q-1', price: 15000 },
      });
      await fsm.handleMessage(SUPPLIER_ID, '5');
      expect(mockSetState).toHaveBeenCalledWith(
        SUPPLIER_ID, 'SUPPLIER_AWAITING_PAYMENT', expect.objectContaining({ deliveryDays: 5 }),
      );
    });

    it('rejeita prazo inválido (negativo)', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_DELIVERY',
        context: { quoteId: 'q-1', price: 15000 },
      });
      await fsm.handleMessage(SUPPLIER_ID, '-3');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('inválido') }),
      );
    });
  });

  describe('SUPPLIER_AWAITING_PAYMENT', () => {
    it('aceita condição e avança para AWAITING_OBS', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_PAYMENT',
        context: { quoteId: 'q-1', price: 15000, deliveryDays: 5 },
      });
      await fsm.handleMessage(SUPPLIER_ID, '30 dias boleto');
      expect(mockSetState).toHaveBeenCalledWith(
        SUPPLIER_ID, 'SUPPLIER_AWAITING_OBS',
        expect.objectContaining({ paymentTerms: '30 dias boleto' }),
      );
    });

    it('rejeita condição muito curta', async () => {
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_PAYMENT',
        context: { quoteId: 'q-1' },
      });
      await fsm.handleMessage(SUPPLIER_ID, 'ab');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('curta') }),
      );
    });
  });

  describe('SUPPLIER_AWAITING_OBS', () => {
    it('"não" finaliza proposta sem observações', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        return fn({
          proposal: { create: jest.fn().mockResolvedValue({ id: 'prop-1' }) },
          proposalItem: { createMany: jest.fn() },
        });
      });
      (prisma.quote.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'q-1', tenantId: 'tenant-1', producerId: 'prod-1', items: [],
      });

      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_OBS',
        context: {
          quoteId: 'q-1', price: 15000, deliveryDays: 5,
          paymentTerms: '30 dias', proposalItems: [],
        },
      });
      await fsm.handleMessage(SUPPLIER_ID, 'não');
      expect(mockDeleteState).toHaveBeenCalledWith(SUPPLIER_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: Messages.PROPOSAL_SENT }),
      );
    });

    it('texto livre é salvo como observação na proposta', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        return fn({
          proposal: { create: jest.fn().mockResolvedValue({ id: 'prop-2' }) },
          proposalItem: { createMany: jest.fn() },
        });
      });
      (prisma.quote.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'q-1', tenantId: 'tenant-1', producerId: 'prod-1', items: [],
      });

      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_OBS',
        context: {
          quoteId: 'q-1', price: 15000, deliveryDays: 5,
          paymentTerms: '30 dias', proposalItems: [],
        },
      });
      await fsm.handleMessage(SUPPLIER_ID, 'Inclui frete até a fazenda');
      expect(mockDeleteState).toHaveBeenCalledWith(SUPPLIER_ID);
    });
  });

  describe('Tratamento de erro', () => {
    it('envia mensagem de erro se handler lançar exceção', async () => {
      // O erro ocorre dentro do try/catch do switch
      mockGetState.mockResolvedValue({
        state: 'SUPPLIER_AWAITING_PRICE',
        context: { quoteId: 'q-1', quoteItems: [] },
      });
      // Forçar erro no setSupplierState
      mockSetState.mockRejectedValueOnce(new Error('DB down'));
      await fsm.handleMessage(SUPPLIER_ID, '15000');
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: Messages.ERROR }),
      );
    });
  });
});
