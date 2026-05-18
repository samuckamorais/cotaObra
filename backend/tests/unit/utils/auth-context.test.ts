/**
 * FF-BE-023 — getAuthContext: regras do PO.
 * - Produtor (USER + producerId) gera contexto com producerId preenchido.
 * - Admin sempre tem producerId=null mesmo se o user tiver vínculo
 *   (Risco 2 da spec — admin nunca é tratado como produtor).
 */
import { getAuthContext } from '../../../src/utils/auth-context';

const baseReq = (user: any): any => ({ user });

describe('getAuthContext', () => {
  it('user USER com producerId → contexto de produtor', () => {
    const ctx = getAuthContext(
      baseReq({ id: 'u1', email: 'a@b', role: 'USER', tenantId: 't1', producerId: 'p1' }),
    );
    expect(ctx.producerId).toBe('p1');
    expect(ctx.role).toBe('USER');
  });

  it('user USER sem producerId → contexto de operador (producerId=null)', () => {
    const ctx = getAuthContext(
      baseReq({ id: 'u2', email: 'b@b', role: 'USER', tenantId: 't1', producerId: null }),
    );
    expect(ctx.producerId).toBeNull();
  });

  it('Risco 2: ADMIN sempre tem producerId=null mesmo se vier preenchido', () => {
    const ctx = getAuthContext(
      baseReq({ id: 'u3', email: 'c@b', role: 'ADMIN', tenantId: 't1', producerId: 'p99' }),
    );
    expect(ctx.role).toBe('ADMIN');
    expect(ctx.producerId).toBeNull();
  });

  it('user sem tenantId → 403', () => {
    expect(() =>
      getAuthContext(baseReq({ id: 'u4', email: 'd@b', role: 'USER' })),
    ).toThrow();
  });

  it('user não autenticado → 401', () => {
    expect(() => getAuthContext(baseReq(undefined))).toThrow();
  });
});
