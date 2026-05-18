import { runOnce } from '../../../src/jobs/detect-abandoned-quotes.job';
import { prisma } from '../../../src/config/database';
import { FSMEventService } from '../../../src/services/fsm-event.service';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    conversationState: {
      findMany: jest.fn(),
    },
    fSMEvent: {
      findFirst: jest.fn(),
    },
  },
}));
jest.mock('../../../src/services/fsm-event.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindMany = prisma.conversationState.findMany as unknown as jest.Mock;
const mockEventFindFirst = prisma.fSMEvent.findFirst as unknown as jest.Mock;
const mockTrack = FSMEventService.track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockTrack.mockResolvedValue(undefined);
});

describe('detect-abandoned-quotes job', () => {
  it('marca como abandonadas conversas paradas > 24h em estados não-terminais', async () => {
    const oldUpdate = new Date(Date.now() - 30 * 3600_000);
    mockFindMany.mockResolvedValue([
      { producerId: 'p1', step: 'AWAITING_PRODUCT', updatedAt: oldUpdate },
      { producerId: 'p2', step: 'AWAITING_REGION', updatedAt: oldUpdate },
    ]);
    mockEventFindFirst.mockResolvedValue(null);

    const result = await runOnce();

    expect(result).toEqual({ scanned: 2, signaled: 2 });
    expect(mockTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        producerId: 'p1',
        eventType: 'quote_abandoned',
        fromState: 'AWAITING_PRODUCT',
      }),
    );
  });

  it('exclui IDLE / CLOSED / QUOTE_ACTIVE do filtro', async () => {
    mockFindMany.mockResolvedValue([]);

    await runOnce();

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.step).toEqual({ notIn: ['IDLE', 'CLOSED', 'QUOTE_ACTIVE'] });
  });

  it('pula produtor que já tem quote_abandoned recente (idempotência)', async () => {
    const oldUpdate = new Date(Date.now() - 30 * 3600_000);
    mockFindMany.mockResolvedValue([
      { producerId: 'p1', step: 'AWAITING_PRODUCT', updatedAt: oldUpdate },
    ]);
    mockEventFindFirst.mockResolvedValue({ id: 'already-tracked' });

    const result = await runOnce();

    expect(result).toEqual({ scanned: 1, signaled: 0 });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('payload inclui idleHours e lastUpdatedAt', async () => {
    const oldUpdate = new Date(Date.now() - 25 * 3600_000);
    mockFindMany.mockResolvedValue([
      { producerId: 'p1', step: 'AWAITING_REGION', updatedAt: oldUpdate },
    ]);
    mockEventFindFirst.mockResolvedValue(null);

    await runOnce();

    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          lastUpdatedAt: expect.any(String),
          idleHours: expect.any(Number),
        }),
      }),
    );
  });

  it('lista vazia → scanned=0 signaled=0 sem chamar track', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await runOnce();
    expect(result).toEqual({ scanned: 0, signaled: 0 });
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
