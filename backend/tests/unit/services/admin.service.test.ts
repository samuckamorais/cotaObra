/**
 * FEAT-008 (FF-BE-029 + FF-BE-030) — AdminService
 *
 * Cobre cenários BDD da spec:
 *   1  super admin cria user (senha gerada) — gravação correta + audit
 *   5  reset re-marca mustChangePassword=true
 *   6  senha gerada NÃO aparece no AuditLog.payload (sanitize prova)
 *   11 senha custom válida persiste e audit usa action distinta
 *   12 senha custom fraca rejeita com 400 (e nada é persistido)
 *
 * Cenário 7 (ADMIN comum → 403) é testado em requireSuperAdmin (CKP 2).
 * Cenário 9 (sem reason → 400) é testado em withReason (CKP 2).
 * Cenário 10 (/api/auth/signup) é teste manual de integração.
 */
import bcrypt from 'bcryptjs';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    quote: { count: jest.fn() },
    proposal: { count: jest.fn() },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { AdminService } from '../../../src/modules/admin/admin.service';
import { prisma } from '../../../src/config/database';

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockTenantFindUnique = prisma.tenant.findUnique as jest.Mock;
const mockTenantCreate = prisma.tenant.create as jest.Mock;
const mockAuditLogCreate = prisma.auditLog.create as jest.Mock;

const ACTOR = 'super-1';

beforeEach(() => {
  jest.clearAllMocks();
  // Defaults: sem duplicidade, sem tenant existente (a menos que o teste sobreescreva)
  mockUserFindUnique.mockResolvedValue(null);
  mockTenantFindUnique.mockResolvedValue(null);
  mockUserCreate.mockResolvedValue({
    id: 'user-new',
    email: 'a@b.com',
    name: 'A',
    role: 'ADMIN',
    tenantId: 'tenant-new',
    active: true,
    mustChangePassword: true,
  });
  mockTenantCreate.mockResolvedValue({
    id: 'tenant-new',
    name: 'Fazenda ABC',
    slug: 'fazenda-abc',
  });
  mockAuditLogCreate.mockResolvedValue({});
});

// ── Cenário 1 ────────────────────────────────────────────────────────
describe('AdminService.createUser — cenário 1 (senha gerada)', () => {
  it('cria tenant + user com senha gerada e marca mustChangePassword=true', async () => {
    const result = await AdminService.createUser({
      email: 'a@b.com',
      name: 'A',
      role: 'ADMIN',
      tenantName: 'Fazenda ABC',
      reason: 'Onboard via WhatsApp 2026-05',
      actorUserId: ACTOR,
    });

    expect(result.passwordMode).toBe('generated');
    expect(result.generatedPassword).toMatch(/.{16}/); // 16 chars
    expect(result.user.mustChangePassword).toBe(true);
    expect(result.tenant?.slug).toBe('fazenda-abc');

    // O hash gravado no banco é bcrypt — a senha em texto retorna SÓ na response
    const createCall = mockUserCreate.mock.calls[0][0].data;
    expect(createCall.password).not.toBe(result.generatedPassword);
    expect(createCall.mustChangePassword).toBe(true);
    expect(createCall.role).toBe('ADMIN');
    expect(createCall.passwordCreatedById).toBe(ACTOR);
  });

  it('action no AuditLog é "create_user" (senha gerada)', async () => {
    await AdminService.createUser({
      email: 'a@b.com',
      name: 'A',
      role: 'ADMIN',
      tenantName: 'X',
      reason: 'Onboard via WhatsApp',
      actorUserId: ACTOR,
    });
    expect(mockAuditLogCreate).toHaveBeenCalled();
    const data = mockAuditLogCreate.mock.calls[0][0].data;
    expect(data.action).toBe('create_user');
    expect(data.targetType).toBe('User');
    expect(data.userId).toBe(ACTOR);
    expect(data.reason).toBe('Onboard via WhatsApp');
  });
});

// ── Cenário 6 ────────────────────────────────────────────────────────
describe('AdminService.createUser — cenário 6 (senha NUNCA em log)', () => {
  it('AuditLog.payload não contém senha gerada nem em texto nem em campo password', async () => {
    const result = await AdminService.createUser({
      email: 'a@b.com',
      name: 'A',
      role: 'ADMIN',
      tenantName: 'X',
      reason: 'Onboard via WhatsApp',
      actorUserId: ACTOR,
    });

    const auditPayload = mockAuditLogCreate.mock.calls[0][0].data.payload;
    expect(auditPayload).toBeDefined();
    expect(JSON.stringify(auditPayload)).not.toContain(result.generatedPassword);
    // Mesmo se houvesse "password" no payload, o sanitizer mascararia.
    // Aqui validamos que o service nem coloca:
    expect(auditPayload).not.toHaveProperty('password');
    expect(auditPayload).not.toHaveProperty('generatedPassword');
  });
});

// ── Cenário 11 ───────────────────────────────────────────────────────
describe('AdminService.createUser — cenário 11 (senha custom válida)', () => {
  it('aceita senha custom forte e usa action diferenciada', async () => {
    const result = await AdminService.createUser({
      email: 'a@b.com',
      name: 'A',
      role: 'ADMIN',
      tenantName: 'X',
      password: 'MinhaSenha123!',
      reason: 'Onboard via WhatsApp',
      actorUserId: ACTOR,
    });

    expect(result.passwordMode).toBe('custom');
    expect(result.generatedPassword).toBe('MinhaSenha123!'); // espelha

    const auditAction = mockAuditLogCreate.mock.calls[0][0].data.action;
    expect(auditAction).toBe('create_user_with_custom_password');
  });

  it('senha custom forte: bcrypt aceita comparação inversa', async () => {
    await AdminService.createUser({
      email: 'a@b.com',
      name: 'A',
      role: 'ADMIN',
      tenantName: 'X',
      password: 'MinhaSenha123!',
      reason: 'Onboard',
      actorUserId: ACTOR,
    });
    const createCall = mockUserCreate.mock.calls[0][0].data;
    const ok = await bcrypt.compare('MinhaSenha123!', createCall.password);
    expect(ok).toBe(true);
  });
});

// ── Cenário 12 ───────────────────────────────────────────────────────
describe('AdminService.createUser — cenário 12 (senha custom fraca rejeita)', () => {
  it('senha "1234" → erro + nada persistido (user.create e audit.create NÃO chamados)', async () => {
    await expect(
      AdminService.createUser({
        email: 'a@b.com',
        name: 'A',
        role: 'ADMIN',
        tenantName: 'X',
        password: '1234',
        reason: 'Onboard',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow();
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});

// ── Email duplicado (edge case 1 da spec) ─────────────────────────────
describe('AdminService.createUser — email duplicado', () => {
  it('retorna 409 quando email já existe no sistema', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'existing', email: 'a@b.com' });
    await expect(
      AdminService.createUser({
        email: 'a@b.com',
        name: 'A',
        role: 'ADMIN',
        tenantName: 'X',
        reason: 'Onboard',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow(/já cadastrado/);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

// ── XOR tenantName/tenantId ──────────────────────────────────────────
describe('AdminService.createUser — validação tenant', () => {
  it('rejeita quando AMBOS tenantName e tenantId são informados', async () => {
    await expect(
      AdminService.createUser({
        email: 'a@b.com',
        name: 'A',
        role: 'ADMIN',
        tenantName: 'X',
        tenantId: '7f2c8a3b-1234-5678-9abc-def012345678',
        reason: 'Onboard',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow(/apenas/i);
  });

  it('SUPER_ADMIN pode ser criado sem tenant (puro — RN-11)', async () => {
    const result = await AdminService.createUser({
      email: 'sa@b.com',
      name: 'SA',
      role: 'SUPER_ADMIN',
      reason: 'Promote sócio para super admin',
      actorUserId: ACTOR,
    });
    expect(result.user.role).toBe('ADMIN'); // user.create foi mockado com ADMIN — só verifica que não quebrou
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockTenantCreate).not.toHaveBeenCalled();
  });

  it('USER comum exige tenantName OU tenantId', async () => {
    await expect(
      AdminService.createUser({
        email: 'a@b.com',
        name: 'A',
        role: 'USER',
        reason: 'Onboard',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow(/tenant/i);
  });
});

// ── Cenário 5 — reset password ───────────────────────────────────────
describe('AdminService.resetPassword — cenário 5', () => {
  it('marca mustChangePassword=true mesmo se já era false', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-2',
      email: 'b@c.com',
      tenantId: 'tenant-1',
      active: true,
    });

    const result = await AdminService.resetPassword({
      targetUserId: 'user-2',
      reason: 'Cliente esqueceu senha',
      actorUserId: ACTOR,
    });

    expect(result.passwordMode).toBe('generated');
    expect(result.generatedPassword.length).toBe(16);

    const updateCall = mockUserUpdate.mock.calls[0][0].data;
    expect(updateCall.mustChangePassword).toBe(true);
    expect(updateCall.passwordCreatedById).toBe(ACTOR);

    const auditAction = mockAuditLogCreate.mock.calls[0][0].data.action;
    expect(auditAction).toBe('reset_password');
  });

  it('auto-reset bloqueado — usar /auth/change-password', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: ACTOR,
      email: 'sa@b.com',
      tenantId: null,
      active: true,
    });
    await expect(
      AdminService.resetPassword({
        targetUserId: ACTOR,
        reason: 'Reset',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow(/própria/);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('senha custom no reset é validada com a mesma regra', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-2',
      email: 'b@c.com',
      tenantId: 't-1',
      active: true,
    });
    await expect(
      AdminService.resetPassword({
        targetUserId: 'user-2',
        password: 'fraca',
        reason: 'Reset',
        actorUserId: ACTOR,
      }),
    ).rejects.toThrow();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});

// ── Toggle ativo ─────────────────────────────────────────────────────
describe('AdminService.setUserActive', () => {
  it('rejeita auto-desativação', async () => {
    await expect(
      AdminService.setUserActive(ACTOR, ACTOR, false, 'Test reason ok 10'),
    ).rejects.toThrow(/si próprio/i);
  });

  it('grava AuditLog com action deactivate_user', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'u2',
      email: 'x@y',
      tenantId: 't1',
      active: true,
    });
    await AdminService.setUserActive(ACTOR, 'u2', false, 'Violação de termos');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { active: false },
    });
    expect(mockAuditLogCreate.mock.calls[0][0].data.action).toBe('deactivate_user');
  });

  it('reativação grava action reactivate_user', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'u2',
      email: 'x@y',
      tenantId: 't1',
      active: false,
    });
    await AdminService.setUserActive(ACTOR, 'u2', true, 'Resolveu a pendência');
    expect(mockAuditLogCreate.mock.calls[0][0].data.action).toBe('reactivate_user');
  });
});
