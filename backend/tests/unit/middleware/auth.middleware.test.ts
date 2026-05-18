import { Request, Response } from 'express';

// Mocks devem ser declarados ANTES do import do módulo testado
jest.mock('../../../src/config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/auth-token.service', () => ({
  AuthTokenService: {
    isBlacklisted: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('jsonwebtoken', () => {
  const actual = jest.requireActual('jsonwebtoken');
  return {
    ...actual,
    verify: jest.fn(),
    decode: jest.fn(),
  };
});

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test_jwt_secret_with_at_least_32_chars',
    NODE_ENV: 'test',
  },
}));

import { authenticate } from '../../../src/middleware/auth.middleware';
import { prisma } from '../../../src/config/database';
import { AuthTokenService } from '../../../src/services/auth-token.service';
import jwt from 'jsonwebtoken';

const mockFindUser = prisma.user.findUnique as jest.Mock;
const mockIsBlacklisted = AuthTokenService.isBlacklisted as jest.Mock;
const mockVerify = jwt.verify as jest.Mock;
const mockDecode = jwt.decode as jest.Mock;

function buildReqResNext(authHeader?: string) {
  const req = {
    headers: { authorization: authHeader },
    userId: undefined,
    userPhone: undefined,
    user: undefined,
  } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn() as jest.Mock;
  return { req, res, next };
}

beforeEach(() => jest.resetAllMocks());

describe('authenticate middleware', () => {
  it('retorna 401 se Authorization header ausente', async () => {
    const { req, res, next } = buildReqResNext(undefined);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Token não fornecido');
  });

  it('retorna 401 se token está vazio (Bearer )', async () => {
    const { req, res, next } = buildReqResNext('Bearer ');
    mockDecode.mockReturnValue(null);
    mockVerify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
  });

  it('retorna 401 se token está na blacklist', async () => {
    const { req, res, next } = buildReqResNext('Bearer some-token');
    mockDecode.mockReturnValue({ userId: 'user-1', jti: 'jti-123' });
    mockIsBlacklisted.mockResolvedValue(true);

    await authenticate(req, res, next);

    expect(mockIsBlacklisted).toHaveBeenCalledWith('jti-123');
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('revogado');
  });

  it('retorna 401 se token está expirado', async () => {
    const { req, res, next } = buildReqResNext('Bearer expired-token');
    mockDecode.mockReturnValue({ userId: 'user-1' });
    mockVerify.mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    await authenticate(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('expirado');
  });

  it('retorna 401 se usuário não encontrado no banco', async () => {
    const { req, res, next } = buildReqResNext('Bearer valid-token');
    mockDecode.mockReturnValue({ userId: 'user-1' });
    mockVerify.mockReturnValue({ userId: 'user-1' });
    mockFindUser.mockResolvedValue(null);

    await authenticate(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('não encontrado');
  });

  it('retorna 401 se usuário está inativo', async () => {
    const { req, res, next } = buildReqResNext('Bearer valid-token');
    mockDecode.mockReturnValue({ userId: 'user-1' });
    mockVerify.mockReturnValue({ userId: 'user-1' });
    mockFindUser.mockResolvedValue({
      id: 'user-1', email: 'a@b.com', role: 'ADMIN', active: false, tenantId: 't1',
    });

    await authenticate(req, res, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('inativo');
  });

  it('chama next() e define req.userId quando token é válido', async () => {
    const { req, res, next } = buildReqResNext('Bearer valid-token');
    mockDecode.mockReturnValue({ userId: 'user-1', phone: '+5564999999999' });
    mockVerify.mockReturnValue({ userId: 'user-1', phone: '+5564999999999' });
    mockFindUser.mockResolvedValue({
      id: 'user-1', email: 'a@b.com', role: 'ADMIN', active: true, tenantId: 't1',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(); // chamado sem erro
    expect(req.userId).toBe('user-1');
    expect(req.userPhone).toBe('+5564999999999');
  });
});
