import { EventEmitter } from 'events';

// Mock logger antes de importar sseManager
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Reimportar sseManager fresco a cada teste
let SseManagerModule: typeof import('../../../src/lib/sse-manager');

beforeEach(() => {
  jest.resetModules();
  jest.resetAllMocks();
  SseManagerModule = require('../../../src/lib/sse-manager');
});

function createMockResponse(): EventEmitter & { write: jest.Mock } {
  const res = new EventEmitter() as EventEmitter & { write: jest.Mock };
  res.write = jest.fn().mockReturnValue(true);
  return res;
}

describe('SseManager', () => {
  describe('addClient', () => {
    it('registra um cliente para o tenant', () => {
      const { sseManager } = SseManagerModule;
      const res = createMockResponse();

      sseManager.addClient('tenant-1', res as any);

      expect(sseManager.getClientCount('tenant-1')).toBe(1);
    });

    it('registra múltiplos clientes para o mesmo tenant', () => {
      const { sseManager } = SseManagerModule;
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      sseManager.addClient('tenant-1', res1 as any);
      sseManager.addClient('tenant-1', res2 as any);

      expect(sseManager.getClientCount('tenant-1')).toBe(2);
    });

    it('registra clientes em tenants diferentes', () => {
      const { sseManager } = SseManagerModule;
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      sseManager.addClient('tenant-1', res1 as any);
      sseManager.addClient('tenant-2', res2 as any);

      expect(sseManager.getClientCount('tenant-1')).toBe(1);
      expect(sseManager.getClientCount('tenant-2')).toBe(1);
      expect(sseManager.getTotalClients()).toBe(2);
    });
  });

  describe('removeClient', () => {
    it('remove cliente automaticamente quando conexão fecha', () => {
      const { sseManager } = SseManagerModule;
      const res = createMockResponse();

      sseManager.addClient('tenant-1', res as any);
      expect(sseManager.getClientCount('tenant-1')).toBe(1);

      // Simular close da conexão
      res.emit('close');

      expect(sseManager.getClientCount('tenant-1')).toBe(0);
    });

    it('remove apenas o cliente correto, mantendo os demais', () => {
      const { sseManager } = SseManagerModule;
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      sseManager.addClient('tenant-1', res1 as any);
      sseManager.addClient('tenant-1', res2 as any);

      res1.emit('close');

      expect(sseManager.getClientCount('tenant-1')).toBe(1);
    });

    it('limpa o Map quando último cliente de um tenant desconecta', () => {
      const { sseManager } = SseManagerModule;
      const res = createMockResponse();

      sseManager.addClient('tenant-1', res as any);
      res.emit('close');

      expect(sseManager.getClientCount('tenant-1')).toBe(0);
      expect(sseManager.getTotalClients()).toBe(0);
    });
  });

  describe('emit', () => {
    it('envia evento para todos os clientes do tenant', () => {
      const { sseManager } = SseManagerModule;
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      sseManager.addClient('tenant-1', res1 as any);
      sseManager.addClient('tenant-1', res2 as any);

      sseManager.emit('tenant-1', 'proposal_received', { quoteId: 'q-1', price: 14200 });

      expect(res1.write).toHaveBeenCalledTimes(1);
      expect(res2.write).toHaveBeenCalledTimes(1);

      const payload = res1.write.mock.calls[0][0] as string;
      expect(payload).toContain('event: proposal_received');
      expect(payload).toContain('"quoteId":"q-1"');
      expect(payload).toContain('"price":14200');
    });

    it('NÃO envia para clientes de outro tenant', () => {
      const { sseManager } = SseManagerModule;
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      sseManager.addClient('tenant-1', res1 as any);
      sseManager.addClient('tenant-2', res2 as any);

      sseManager.emit('tenant-1', 'quote_consolidated', { quoteId: 'q-1' });

      expect(res1.write).toHaveBeenCalledTimes(1);
      expect(res2.write).not.toHaveBeenCalled();
    });

    it('não lança erro se tenant não tem clientes', () => {
      const { sseManager } = SseManagerModule;

      expect(() => {
        sseManager.emit('tenant-vazio', 'test_event', { data: 1 });
      }).not.toThrow();
    });

    it('formata payload SSE corretamente (event + data + newlines)', () => {
      const { sseManager } = SseManagerModule;
      const res = createMockResponse();

      sseManager.addClient('t1', res as any);
      sseManager.emit('t1', 'quote_expired', { quoteId: 'q-2' });

      const payload = res.write.mock.calls[0][0] as string;
      expect(payload).toMatch(/^event: quote_expired\ndata: \{.*\}\n\n$/);
    });

    it('não quebra se res.write lançar erro (cliente desconectou)', () => {
      const { sseManager } = SseManagerModule;
      const res = createMockResponse();
      res.write.mockImplementation(() => { throw new Error('Connection reset'); });

      sseManager.addClient('t1', res as any);

      expect(() => {
        sseManager.emit('t1', 'test', { data: 1 });
      }).not.toThrow();
    });
  });

  describe('getClientCount / getTotalClients', () => {
    it('retorna 0 para tenant sem clientes', () => {
      const { sseManager } = SseManagerModule;
      expect(sseManager.getClientCount('inexistente')).toBe(0);
    });

    it('getTotalClients soma todos os tenants', () => {
      const { sseManager } = SseManagerModule;

      sseManager.addClient('t1', createMockResponse() as any);
      sseManager.addClient('t1', createMockResponse() as any);
      sseManager.addClient('t2', createMockResponse() as any);

      expect(sseManager.getTotalClients()).toBe(3);
    });
  });

  describe('eventos suportados', () => {
    const events = ['proposal_received', 'quote_consolidated', 'quote_expired', 'followup_sent'];

    events.forEach((eventName) => {
      it(`emite evento '${eventName}' corretamente`, () => {
        const { sseManager } = SseManagerModule;
        const res = createMockResponse();

        sseManager.addClient('t1', res as any);
        sseManager.emit('t1', eventName, { quoteId: 'q-test' });

        const payload = res.write.mock.calls[0][0] as string;
        expect(payload).toContain(`event: ${eventName}`);
      });
    });
  });
});
