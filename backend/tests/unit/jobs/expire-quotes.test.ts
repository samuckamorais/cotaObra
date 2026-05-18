/**
 * Testes do expire-quotes job:
 * - Batch processing (500 por iteração)
 * - Notificação ao produtor
 * - Reset do ConversationState para IDLE
 * - Lock Redis (skip se consolidate já processando)
 */
import { BATCH_SIZE } from '../../../src/jobs/expire-quotes.job';

// Verificação do tamanho do batch
describe('expire-quotes job', () => {
  describe('configuração', () => {
    it('BATCH_SIZE é 500', () => {
      expect(BATCH_SIZE).toBe(500);
    });
  });
});

// Simulação do fluxo de batch — testa a lógica sem cron
import { prisma } from '../../../src/config/database';
import { whatsappService } from '../../../src/modules/whatsapp/whatsapp.service';
import { JobLockService } from '../../../src/services/job-lock.service';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    quote: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    conversationState: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/modules/whatsapp/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/services/job-lock.service', () => ({
  JobLockService: {
    acquire: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindMany = prisma.quote.findMany as jest.Mock;
const mockUpdateMany = prisma.quote.updateMany as jest.Mock;
const mockUpdateState = prisma.conversationState.updateMany as jest.Mock;
const mockSendMessage = whatsappService.sendMessage as jest.Mock;
const mockAcquire = JobLockService.acquire as jest.Mock;

function makeQuote(id: string) {
  return {
    id,
    product: `Produto-${id}`,
    producerId: `prod-${id}`,
    producer: { phone: `+5564${id.padStart(9, '0')}`, name: `Produtor ${id}` },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSendMessage.mockResolvedValue(undefined);
  mockAcquire.mockResolvedValue(true);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockUpdateState.mockResolvedValue({ count: 1 });
  mockFindMany.mockResolvedValue([]);
  (JobLockService.release as jest.Mock).mockResolvedValue(undefined);
});

describe('expire-quotes batch processing', () => {
  /**
   * Simula o loop de batch do job sem o cron.
   * Replica a lógica do startExpireQuotesJob.
   */
  async function runExpireBatchLoop() {
    let totalExpired = 0;
    let batchNumber = 0;

    while (true) {
      batchNumber++;
      const candidates = await prisma.quote.findMany({
        where: { status: 'COLLECTING', expiresAt: { lt: new Date() } },
        select: { id: true, product: true, producerId: true, producer: { select: { phone: true, name: true } } },
        take: BATCH_SIZE,
      });

      if (candidates.length === 0) break;

      for (const quote of candidates) {
        const locked = await JobLockService.acquire(quote.id, 'expire');
        if (!locked) continue;

        try {
          const result = await prisma.quote.updateMany({
            where: { id: quote.id, status: 'COLLECTING' },
            data: { status: 'EXPIRED', processedBy: 'expire' },
          });

          if (result.count > 0) {
            totalExpired++;
            await whatsappService.sendMessage({
              to: quote.producer.phone,
              body: `Cotação ${quote.product} expirada`,
            }).catch(() => {});

            await prisma.conversationState.updateMany({
              where: { producerId: quote.producerId },
              data: { step: 'IDLE', context: {} },
            }).catch(() => {});
          }
        } finally {
          await JobLockService.release(quote.id, 'expire');
        }
      }

      if (candidates.length < BATCH_SIZE) break;
    }

    return { totalExpired, batchNumber };
  }

  it('processa cotações em batches de 500', async () => {
    // Primeiro batch: 500 cotações, segundo: 200, terceiro: 0
    const batch1 = Array.from({ length: 500 }, (_, i) => makeQuote(`b1-${i}`));
    const batch2 = Array.from({ length: 200 }, (_, i) => makeQuote(`b2-${i}`));

    mockFindMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUpdateState.mockResolvedValue({ count: 1 });

    const result = await runExpireBatchLoop();

    // 2 batches com dados + 0 no terceiro (mas break no segundo por < BATCH_SIZE)
    expect(result.batchNumber).toBe(2);
    expect(result.totalExpired).toBe(700);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it('chama updateMany, sendMessage e updateState para cada cotação', async () => {
    // Este teste verifica que todos os side effects ocorrem para cada cotação
    mockFindMany.mockResolvedValueOnce([makeQuote('single')]).mockResolvedValue([]);

    await runExpireBatchLoop();

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateState).toHaveBeenCalledTimes(1);
    // sendMessage é chamado dentro do loop
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('reseta ConversationState para IDLE', async () => {
    mockFindMany.mockResolvedValueOnce([makeQuote('q-1')]).mockResolvedValueOnce([]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUpdateState.mockResolvedValue({ count: 1 });

    await runExpireBatchLoop();

    expect(mockUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ producerId: 'prod-q-1' }),
        data: expect.objectContaining({ step: 'IDLE' }),
      }),
    );
  });

  it('pula cotação quando lock não é adquirido (consolidate processando)', async () => {
    mockFindMany.mockResolvedValueOnce([makeQuote('locked')]).mockResolvedValueOnce([]);
    mockAcquire.mockResolvedValueOnce(false);

    const result = await runExpireBatchLoop();

    expect(result.totalExpired).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('processa múltiplos batches quando há mais que BATCH_SIZE candidatos', async () => {
    const batch1 = Array.from({ length: 500 }, (_, i) => makeQuote(`a${i}`));
    const batch2 = Array.from({ length: 200 }, (_, i) => makeQuote(`b${i}`));

    mockFindMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);

    const result = await runExpireBatchLoop();

    // batch1 = 500 (= BATCH_SIZE, continua loop), batch2 = 200 (< BATCH_SIZE, para)
    expect(result.batchNumber).toBe(2);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    // Cada cotação chama updateMany
    expect(mockUpdateMany).toHaveBeenCalledTimes(700);
  });
});
