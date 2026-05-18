import { MidFlowBufferService } from '../../../src/services/mid-flow-buffer.service';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockRedis = redis as unknown as { setex: jest.Mock; get: jest.Mock; del: jest.Mock };

const ENTRY = {
  newContext: { region: 'Rio Verde' },
  interruptedState: 'AWAITING_PRODUCT',
  originalMessage: 'SSP 60 ton Rio Verde',
  fieldsExtracted: 3,
  storedAt: '2026-05-08T12:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.setex = jest.fn().mockResolvedValue('OK');
  mockRedis.get = jest.fn().mockResolvedValue(null);
  mockRedis.del = jest.fn().mockResolvedValue(1);
});

describe('MidFlowBufferService', () => {
  it('set grava com TTL 5min', async () => {
    await MidFlowBufferService.set('p1', ENTRY);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'midflow_buffer:p1',
      5 * 60,
      expect.any(String),
    );
  });

  it('get retorna entry desserializada', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(ENTRY));
    const result = await MidFlowBufferService.get('p1');
    expect(result).toEqual(ENTRY);
  });

  it('get retorna null quando ausente', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await MidFlowBufferService.get('p1')).toBeNull();
  });

  it('get fail-open em erro', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'));
    expect(await MidFlowBufferService.get('p1')).toBeNull();
  });

  it('clear deleta a chave', async () => {
    await MidFlowBufferService.clear('p1');
    expect(mockRedis.del).toHaveBeenCalledWith('midflow_buffer:p1');
  });

  it('set fail-open em erro', async () => {
    mockRedis.setex.mockRejectedValue(new Error('redis down'));
    await expect(MidFlowBufferService.set('p1', ENTRY)).resolves.not.toThrow();
  });
});
