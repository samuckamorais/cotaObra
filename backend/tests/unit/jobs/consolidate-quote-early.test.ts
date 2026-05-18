/**
 * FEAT-EARLY-CLOSE — markQuoteResponse + tryConsolidateEarly
 *
 * Foco do teste:
 *   - markQuoteResponse marca respondedAt e responseType
 *   - É idempotente: chamada repetida não move o timestamp original
 *   - Falha de DB não derruba o fluxo (best-effort)
 *
 *   - tryConsolidateEarly chama consolidateQuote quando TODOS responderam
 *   - tryConsolidateEarly é no-op quando falta alguém responder
 *   - tryConsolidateEarly é no-op quando quote já não está COLLECTING
 *   - tryConsolidateEarly não derruba caller em caso de erro
 */
jest.mock('../../../src/config/database', () => ({
  prisma: {
    quote: { findUnique: jest.fn() },
    quoteSupplierNotification: { updateMany: jest.fn(), findMany: jest.fn() },
  },
}));


jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logWithContext: jest.fn(),
}));

// Cron init — pulamos. Mockamos no-op pra módulo não disparar schedule no import.
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

// O `consolidateQuote` real puxa muita coisa (whatsapp, lock Redis, SSE).
// Vamos mockar APENAS ele e testar o tryConsolidateEarly orquestrando.
// Como ambos vivem no mesmo arquivo, vamos usar jest.spyOn em runtime.
jest.mock('../../../src/services/job-lock.service', () => ({
  JobLockService: { acquire: jest.fn(), release: jest.fn() },
}));
jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn() },
}));
jest.mock('../../../src/services/analytics.service', () => ({
  analyticsService: { trackEvent: jest.fn() },
}));
jest.mock('../../../src/lib/sse-manager', () => ({
  sseManager: { emit: jest.fn() },
}));

import {
  markQuoteResponse,
  tryConsolidateEarly,
} from '../../../src/jobs/consolidate-quote.job';
import { prisma } from '../../../src/config/database';
import { JobLockService } from '../../../src/services/job-lock.service';

const mockUpdateMany = prisma.quoteSupplierNotification.updateMany as jest.Mock;
const mockFindNotifications = prisma.quoteSupplierNotification.findMany as jest.Mock;
const mockFindQuote = prisma.quote.findUnique as jest.Mock;
const mockLockAcquire = JobLockService.acquire as jest.Mock;
const mockLockRelease = JobLockService.release as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('markQuoteResponse', () => {
  it('marca respondedAt + responseType quando ainda não respondeu', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await markQuoteResponse('q1', 's1', 'PROPOSAL');

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { quoteId: 'q1', supplierId: 's1', respondedAt: null },
      data: expect.objectContaining({
        respondedAt: expect.any(Date),
        responseType: 'PROPOSAL',
      }),
    });
  });

  it('idempotente: chamada repetida é no-op (count 0)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(markQuoteResponse('q1', 's1', 'PROPOSAL')).resolves.toBeUndefined();
    // Não lança nem retorna erro
  });

  it('falha de DB não derruba o caller (best-effort)', async () => {
    mockUpdateMany.mockRejectedValue(new Error('connection lost'));

    await expect(markQuoteResponse('q1', 's1', 'PROPOSAL')).resolves.toBeUndefined();
  });

  it('aceita responseType DECLINED', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await markQuoteResponse('q1', 's1', 'DECLINED');

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responseType: 'DECLINED' }),
      }),
    );
  });
});

describe('tryConsolidateEarly', () => {
  beforeEach(() => {
    // Lock falha → consolidateQuote retorna early sem fazer side effects.
    // O importante para o teste é se o caminho de consolidação foi
    // disparado (i.e., JobLockService.acquire foi chamado).
    mockLockAcquire.mockResolvedValue(false);
    mockLockRelease.mockResolvedValue(undefined);
  });

  it('chama consolidateQuote quando TODOS responderam (acquire chamado)', async () => {
    mockFindQuote.mockResolvedValue({ id: 'q1', status: 'COLLECTING' });
    mockFindNotifications.mockResolvedValue([
      { respondedAt: new Date() },
      { respondedAt: new Date() },
      { respondedAt: new Date() },
    ]);

    await tryConsolidateEarly('q1');

    expect(mockLockAcquire).toHaveBeenCalledWith('q1', 'consolidate');
  });

  it('NÃO consolida quando falta alguém responder', async () => {
    mockFindQuote.mockResolvedValue({ id: 'q1', status: 'COLLECTING' });
    mockFindNotifications.mockResolvedValue([
      { respondedAt: new Date() },
      { respondedAt: null }, // ainda não respondeu
      { respondedAt: new Date() },
    ]);

    await tryConsolidateEarly('q1');

    expect(mockLockAcquire).not.toHaveBeenCalled();
  });

  it('NÃO consolida quando quote já não está COLLECTING (SUMMARIZED/EXPIRED/CLOSED)', async () => {
    mockFindQuote.mockResolvedValue({ id: 'q1', status: 'SUMMARIZED' });

    await tryConsolidateEarly('q1');

    expect(mockLockAcquire).not.toHaveBeenCalled();
    expect(mockFindNotifications).not.toHaveBeenCalled(); // short-circuit
  });

  it('NÃO consolida quando quote não existe', async () => {
    mockFindQuote.mockResolvedValue(null);

    await tryConsolidateEarly('q-inexistente');

    expect(mockLockAcquire).not.toHaveBeenCalled();
  });

  it('NÃO consolida quando não há notifications (edge)', async () => {
    mockFindQuote.mockResolvedValue({ id: 'q1', status: 'COLLECTING' });
    mockFindNotifications.mockResolvedValue([]);

    await tryConsolidateEarly('q1');

    expect(mockLockAcquire).not.toHaveBeenCalled();
  });

  it('NÃO derruba caller em caso de erro inesperado', async () => {
    mockFindQuote.mockRejectedValue(new Error('Redis down'));

    await expect(tryConsolidateEarly('q1')).resolves.toBeUndefined();
    expect(mockLockAcquire).not.toHaveBeenCalled();
  });

  it('consolida cenário "todos recusam" (todos DECLINED — zero propostas)', async () => {
    mockFindQuote.mockResolvedValue({ id: 'q1', status: 'COLLECTING' });
    mockFindNotifications.mockResolvedValue([
      { respondedAt: new Date() },
      { respondedAt: new Date() },
    ]);

    await tryConsolidateEarly('q1');

    // consolidateQuote internamente trata zero propostas → EXPIRED.
    // tryConsolidateEarly só precisa disparar — verificamos via acquire.
    expect(mockLockAcquire).toHaveBeenCalledWith('q1', 'consolidate');
  });
});
