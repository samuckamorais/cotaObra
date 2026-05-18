/**
 * FEAT-008 (FF-BE-028) — forcePasswordChange middleware
 *
 * RN-04 + Cenário 3 da spec: quando JWT.mustChangePassword=true, qualquer
 * endpoint exceto whitelist retorna 403 com header X-Force-Password-Change.
 */
import { forcePasswordChange } from '../../../src/middleware/force-password-change.middleware';

const buildRes = () => {
  const res: any = {};
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('forcePasswordChange', () => {
  it('passa se não há user autenticado (rota pública)', () => {
    const req: any = { path: '/quotes', user: undefined };
    const res = buildRes();
    const next = jest.fn();
    forcePasswordChange(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passa se mustChangePassword=false', () => {
    const req: any = { path: '/quotes', user: { id: 'u1', mustChangePassword: false } };
    const res = buildRes();
    const next = jest.fn();
    forcePasswordChange(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Cenário 3: bloqueia com 403 + header se mustChangePassword=true em rota fora da whitelist', () => {
    const req: any = { path: '/quotes', user: { id: 'u1', mustChangePassword: true } };
    const res = buildRes();
    const next = jest.fn();
    forcePasswordChange(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.setHeader).toHaveBeenCalledWith('X-Force-Password-Change', 'true');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'FORCE_PASSWORD_CHANGE' }),
      }),
    );
  });

  it.each(['/auth/change-password', '/auth/logout', '/auth/me'])(
    'permite "%s" mesmo com mustChangePassword=true (whitelist)',
    (path) => {
      const req: any = { path, user: { id: 'u1', mustChangePassword: true } };
      const res = buildRes();
      const next = jest.fn();
      forcePasswordChange(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('Cenário 4 (parcial): user sem flag tem acesso a tudo', () => {
    const req: any = { path: '/dashboard', user: { id: 'u1' } };
    const res = buildRes();
    const next = jest.fn();
    forcePasswordChange(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
