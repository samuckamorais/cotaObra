import { Request, Response } from 'express';

jest.mock('../../../src/config/redis', () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(55),
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    MAX_MESSAGES_PER_PHONE_PER_MINUTE: 5,
    RATE_LIMIT_GLOBAL: 100,
    RATE_LIMIT_AUTH: 5,
    RATE_LIMIT_PUBLIC: 10,
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { rateLimitByPhone, forgotPasswordRateLimit } from '../../../src/middleware/rate-limit.middleware';
import { redis } from '../../../src/config/redis';

const mockIncr = redis.incr as jest.Mock;
const mockExpire = redis.expire as jest.Mock;
const mockTtl = redis.ttl as jest.Mock;

function buildReqResNext(body: Record<string, unknown> = {}) {
  const req = { body } as unknown as Request;
  const res = {
    setHeader: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as jest.Mock;
  return { req, res, next };
}

beforeEach(() => jest.resetAllMocks());

describe('rateLimitByPhone', () => {
  it('chama next() quando abaixo do limite', async () => {
    const { req, res, next } = buildReqResNext({ from: '+5564999999999' });
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(55);

    await rateLimitByPhone(req, res, next);

    expect(mockIncr).toHaveBeenCalledWith('rate_limit:+5564999999999');
    expect(mockExpire).toHaveBeenCalledWith('rate_limit:+5564999999999', 60);
    expect(next).toHaveBeenCalledWith(); // sem erro
  });

  it('retorna erro quando limite excedido', async () => {
    const { req, res, next } = buildReqResNext({ from: '+5564999999999' });
    mockIncr.mockResolvedValue(6); // acima do limite de 5

    await rateLimitByPhone(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Limite');
  });

  it('pula rate limiting quando telefone não fornecido', async () => {
    const { req, res, next } = buildReqResNext({});

    await rateLimitByPhone(req, res, next);

    expect(mockIncr).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(); // sem erro
  });
});

describe('forgotPasswordRateLimit', () => {
  it('chama next() quando abaixo do limite', async () => {
    const { req, res, next } = buildReqResNext({ email: 'Test@FARM.com' });
    mockIncr.mockResolvedValue(1);

    await forgotPasswordRateLimit(req, res, next);

    expect(mockIncr).toHaveBeenCalledWith('rate_limit:forgot_pwd:test@farm.com');
    expect(mockExpire).toHaveBeenCalledWith('rate_limit:forgot_pwd:test@farm.com', 3600);
    expect(next).toHaveBeenCalledWith();
  });

  it('retorna erro quando limite excedido (>3 por hora)', async () => {
    const { req, res, next } = buildReqResNext({ email: 'test@farm.com' });
    mockIncr.mockResolvedValue(4); // acima de 3

    await forgotPasswordRateLimit(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('recuperação de senha');
  });
});
