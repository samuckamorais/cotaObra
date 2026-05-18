import { StatusCheckRateLimit } from '../../../src/services/status-rate-limit.service';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockRedis = redis as unknown as {
  incr: jest.Mock;
  expire: jest.Mock;
  ttl: jest.Mock;
  del: jest.Mock;
};

const PRODUCER_ID = 'prod-abc';

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.incr = jest.fn();
  mockRedis.expire = jest.fn().mockResolvedValue(1);
  mockRedis.ttl = jest.fn().mockResolvedValue(3500);
  mockRedis.del = jest.fn().mockResolvedValue(1);
});

describe('StatusCheckRateLimit.check()', () => {
  it('libera primeira consulta e seta TTL', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const result = await StatusCheckRateLimit.check(PRODUCER_ID);

    expect(mockRedis.incr).toHaveBeenCalledWith(`producer_status_check:${PRODUCER_ID}`);
    expect(mockRedis.expire).toHaveBeenCalledWith(
      `producer_status_check:${PRODUCER_ID}`,
      3600,
    );
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
  });

  it('libera consulta dentro do limite (5)', async () => {
    mockRedis.incr.mockResolvedValue(5);
    const result = await StatusCheckRateLimit.check(PRODUCER_ID);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(5);
  });

  it('bloqueia 6ª consulta na mesma janela', async () => {
    mockRedis.incr.mockResolvedValue(6);
    const result = await StatusCheckRateLimit.check(PRODUCER_ID);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(6);
    expect(result.retryAfterSec).toBe(3500);
  });

  it('não chama EXPIRE nas consultas subsequentes', async () => {
    mockRedis.incr.mockResolvedValue(2);
    await StatusCheckRateLimit.check(PRODUCER_ID);
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('fail-open: libera consulta se Redis falhar', async () => {
    mockRedis.incr.mockRejectedValue(new Error('redis down'));
    const result = await StatusCheckRateLimit.check(PRODUCER_ID);
    expect(result.allowed).toBe(true);
  });
});
