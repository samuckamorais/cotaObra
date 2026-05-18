import { FSMEventService } from '../../../src/services/fsm-event.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    fSMEvent: {
      create: jest.fn(),
    },
  },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCreate = prisma.fSMEvent.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
});

describe('FSMEventService.track', () => {
  it('grava evento com producerId, eventType, fromState, toState e payload', async () => {
    await FSMEventService.track({
      producerId: 'p1',
      eventType: 'state_transition',
      fromState: 'IDLE',
      toState: 'AWAITING_CATEGORY',
      payload: { x: 1 },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        producerId: 'p1',
        eventType: 'state_transition',
        fromState: 'IDLE',
        toState: 'AWAITING_CATEGORY',
        payload: { x: 1 },
      },
    });
  });

  it('aceita fromState/toState ausentes', async () => {
    await FSMEventService.track({
      producerId: 'p1',
      eventType: 'quote_dispatched',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        producerId: 'p1',
        eventType: 'quote_dispatched',
        fromState: null,
        toState: null,
      }),
    });
  });

  it('NÃO propaga falha de banco — observabilidade não pode quebrar fluxo', async () => {
    mockCreate.mockRejectedValue(new Error('connection refused'));

    await expect(
      FSMEventService.track({ producerId: 'p1', eventType: 'state_transition' }),
    ).resolves.not.toThrow();
  });
});

describe('FSMEventService.trackTransition', () => {
  it('passa eventType=state_transition e payload com durationMs', async () => {
    await FSMEventService.trackTransition('p1', 'IDLE', 'AWAITING_PRODUCT', { durationMs: 1200 });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'state_transition',
        fromState: 'IDLE',
        toState: 'AWAITING_PRODUCT',
        payload: { durationMs: 1200 },
      }),
    });
  });

  it('aceita fromState null (primeira mensagem do produtor)', async () => {
    await FSMEventService.trackTransition('p1', null, 'AWAITING_PRODUCT');

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromState: null,
        toState: 'AWAITING_PRODUCT',
      }),
    });
  });
});

describe('FSMEventService.trackCommand', () => {
  it('grava command_global com payload.command e fromState', async () => {
    await FSMEventService.trackCommand('p1', 'cancelar', 'AWAITING_PRODUCT');

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'command_global',
        fromState: 'AWAITING_PRODUCT',
        payload: { command: 'cancelar' },
      }),
    });
  });
});
