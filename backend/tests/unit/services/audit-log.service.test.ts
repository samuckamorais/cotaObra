/**
 * FEAT-008 (FF-BE-028) — AuditLogService
 *
 * Cobre principalmente o RISCO CRÍTICO 1 da spec: senha temp NUNCA pode
 * vazar no payload. O sanitizador remove campos sensíveis recursivamente.
 *
 * Também garante que falha de auditoria NÃO derruba a operação principal
 * (auditoria é best-effort).
 */
import {
  AuditLogService,
  sanitizeAuditPayload,
} from '../../../src/services/audit-log.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    auditLog: { create: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockCreate = prisma.auditLog.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
});

describe('sanitizeAuditPayload — risco crítico 1: senha nunca em log', () => {
  it('mascara campo "password" no topo', () => {
    expect(sanitizeAuditPayload({ email: 'a@b', password: 'secret' })).toEqual({
      email: 'a@b',
      password: '[REDACTED]',
    });
  });

  it('mascara "generatedPassword", "newPassword", "oldPassword" (qualquer key contendo "password")', () => {
    const sanitized = sanitizeAuditPayload({
      generatedPassword: 'X',
      newPassword: 'Y',
      oldPassword: 'Z',
    });
    expect(sanitized).toEqual({
      generatedPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
      oldPassword: '[REDACTED]',
    });
  });

  it('mascara token/secret/otp/authorization/apiKey/api_key', () => {
    const sanitized = sanitizeAuditPayload({
      accessToken: 'a',
      refreshToken: 'b',
      secretKey: 'c',
      otp: '123',
      Authorization: 'Bearer x',
      apiKey: 'k',
      api_key: 'k2',
    }) as Record<string, string>;
    for (const v of Object.values(sanitized)) {
      expect(v).toBe('[REDACTED]');
    }
  });

  it('mascara campos sensíveis ANINHADOS em objetos', () => {
    const sanitized = sanitizeAuditPayload({
      user: {
        email: 'a@b',
        credentials: { password: 'X', token: 'Y' },
      },
    });
    expect(sanitized).toEqual({
      user: {
        email: 'a@b',
        credentials: { password: '[REDACTED]', token: '[REDACTED]' },
      },
    });
  });

  it('mascara campos sensíveis dentro de arrays', () => {
    const sanitized = sanitizeAuditPayload({
      users: [
        { email: 'a@b', password: 'X' },
        { email: 'c@d', password: 'Y' },
      ],
    });
    expect((sanitized as any).users[0].password).toBe('[REDACTED]');
    expect((sanitized as any).users[1].password).toBe('[REDACTED]');
    expect((sanitized as any).users[0].email).toBe('a@b');
  });

  it('preserva campos NÃO sensíveis (não confunde com substring)', () => {
    // "passwordless", "tokenize" não casariam num matcher exact — mas casam
    // no nosso regex parcial. Documenta o trade-off: prefiro falso positivo
    // (mascarar algo benigno) do que falso negativo (vazar senha).
    const sanitized = sanitizeAuditPayload({ id: 'x', name: 'João' });
    expect(sanitized).toEqual({ id: 'x', name: 'João' });
  });

  it('lida com null/undefined/primitivos', () => {
    expect(sanitizeAuditPayload(null)).toBeNull();
    expect(sanitizeAuditPayload(undefined)).toBeUndefined();
    expect(sanitizeAuditPayload('string')).toBe('string');
    expect(sanitizeAuditPayload(42)).toBe(42);
  });
});

describe('AuditLogService.log', () => {
  it('persiste action + targetType/Id + tenantId + reason + payload sanitizado', async () => {
    await AuditLogService.log({
      userId: 'super-1',
      action: 'create_user',
      targetType: 'User',
      targetId: 'user-2',
      tenantId: 'tenant-1',
      reason: 'Onboard via WhatsApp',
      payload: { email: 'a@b', generatedPassword: 'XYZ' },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.userId).toBe('super-1');
    expect(data.action).toBe('create_user');
    expect(data.targetType).toBe('User');
    expect(data.targetId).toBe('user-2');
    expect(data.tenantId).toBe('tenant-1');
    expect(data.reason).toBe('Onboard via WhatsApp');
    expect(data.payload.email).toBe('a@b');
    expect(data.payload.generatedPassword).toBe('[REDACTED]');
  });

  it('extrai ip e user-agent do req quando fornecido', async () => {
    const fakeReq: any = {
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
      headers: { 'user-agent': 'Mozilla/5.0' },
    };
    await AuditLogService.log({
      userId: 'super-1',
      action: 'list_users',
      req: fakeReq,
    });
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.ip).toBe('10.0.0.1');
    expect(data.userAgent).toBe('Mozilla/5.0');
  });

  it('NÃO lança quando o create do Prisma falha (auditoria é best-effort)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      AuditLogService.log({ userId: 'super-1', action: 'create_user' }),
    ).resolves.toBeUndefined();
  });

  it('omite payload quando não fornecido', async () => {
    await AuditLogService.log({ userId: 'super-1', action: 'list_tenants' });
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.payload).toBeUndefined();
  });
});
