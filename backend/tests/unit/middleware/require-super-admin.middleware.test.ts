/**
 * FEAT-008 (FF-BE-028) — requireSuperAdmin middleware
 *
 * Cenário 7 da spec: ADMIN comum → 403 ao tentar /api/admin/*.
 * SUPER_ADMIN passa.
 */
jest.mock('../../../src/config/database', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import { requireSuperAdmin } from '../../../src/middleware/rbac.middleware';
import { prisma } from '../../../src/config/database';

const mockFind = prisma.user.findUnique as jest.Mock;

const buildRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('requireSuperAdmin', () => {
  it('401 quando não autenticado (sem req.userId)', async () => {
    const req: any = {};
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/não autenticado/i) }),
    );
  });

  it('401 quando user do JWT não existe mais no banco', async () => {
    mockFind.mockResolvedValue(null);
    const req: any = { userId: 'u1' };
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/não encontrado/i) }),
    );
  });

  it('401 quando user inativo', async () => {
    mockFind.mockResolvedValue({ id: 'u1', active: false, role: 'SUPER_ADMIN' });
    const req: any = { userId: 'u1' };
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/inativo/i) }),
    );
  });

  it('Cenário 7: ADMIN comum recebe 403 (não é super admin)', async () => {
    mockFind.mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      role: 'ADMIN',
      active: true,
      tenantId: 't1',
      producerId: null,
    });
    const req: any = { userId: 'u1' };
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/super administradores/i),
      }),
    );
  });

  it('USER comum também recebe 403', async () => {
    mockFind.mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      role: 'USER',
      active: true,
      tenantId: 't1',
      producerId: 'p1',
    });
    const req: any = { userId: 'u1' };
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/super administradores/i) }),
    );
  });

  it('SUPER_ADMIN passa e tem req.user populado', async () => {
    mockFind.mockResolvedValue({
      id: 'su-1',
      email: 'sa@cotaobra',
      role: 'SUPER_ADMIN',
      active: true,
      tenantId: null,
      producerId: null,
    });
    const req: any = { userId: 'su-1' };
    const res = buildRes();
    const next = jest.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual(
      expect.objectContaining({ id: 'su-1', role: 'SUPER_ADMIN' }),
    );
  });
});
