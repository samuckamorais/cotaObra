/**
 * FEAT-008 (FF-BE-031) — require2FAEnrolledForSuperAdmin
 *
 * Cenário 8 da spec: SUPER_ADMIN sem 2FA → 403 com header X-Require-2FA-Setup.
 * ADMIN comum NÃO é forçado a 2FA (regressão evitada).
 */
jest.mock('../../../src/config/database', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import { require2FAEnrolledForSuperAdmin } from '../../../src/middleware/require-2fa.middleware';
import { prisma } from '../../../src/config/database';

const mockFind = prisma.user.findUnique as jest.Mock;

const buildRes = () => {
  const res: any = {};
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('require2FAEnrolledForSuperAdmin', () => {
  it('passa quando não há req.user (rota pública — não bloqueia)', async () => {
    const req: any = {};
    const res = buildRes();
    const next = jest.fn();
    await require2FAEnrolledForSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('passa quando role !== SUPER_ADMIN (ADMIN comum não é forçado)', async () => {
    const req: any = { user: { id: 'u1', role: 'ADMIN' } };
    const res = buildRes();
    const next = jest.fn();
    await require2FAEnrolledForSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(mockFind).not.toHaveBeenCalled(); // sem query extra
  });

  it('passa quando role === USER', async () => {
    const req: any = { user: { id: 'u1', role: 'USER' } };
    const res = buildRes();
    const next = jest.fn();
    await require2FAEnrolledForSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('Cenário 8: SUPER_ADMIN sem 2FA → 403 com header X-Require-2FA-Setup', async () => {
    mockFind.mockResolvedValue({ twoFactorEnabled: false });
    const req: any = { user: { id: 'su-1', role: 'SUPER_ADMIN' } };
    const res = buildRes();
    const next = jest.fn();
    await require2FAEnrolledForSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.setHeader).toHaveBeenCalledWith('X-Require-2FA-Setup', 'true');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'REQUIRE_2FA_SETUP' }),
      }),
    );
  });

  it('SUPER_ADMIN com 2FA ativo passa', async () => {
    mockFind.mockResolvedValue({ twoFactorEnabled: true });
    const req: any = { user: { id: 'su-1', role: 'SUPER_ADMIN' } };
    const res = buildRes();
    const next = jest.fn();
    await require2FAEnrolledForSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
