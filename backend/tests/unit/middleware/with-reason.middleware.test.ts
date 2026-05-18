/**
 * FEAT-008 (FF-BE-028) — withReason middleware
 *
 * RN-08 + Cenário 9 da spec: ações sensíveis exigem campo "reason"
 * (>= 10 chars, configurável). Sem ele → 400 REASON_REQUIRED.
 */
import { withReason, REASON_MIN_LENGTH } from '../../../src/middleware/with-reason.middleware';

const buildRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('withReason', () => {
  it('Cenário 9: 400 quando body não tem reason', () => {
    const middleware = withReason();
    const req: any = { body: {} };
    const res = buildRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'REASON_REQUIRED' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('400 quando reason é string vazia', () => {
    const req: any = { body: { reason: '' } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 quando reason tem só espaços (após trim)', () => {
    const req: any = { body: { reason: '          ' } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 quando reason < min length (default 10)', () => {
    const req: any = { body: { reason: 'curta' } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 quando reason não é string', () => {
    const req: any = { body: { reason: 42 } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('aceita reason com exatamente min length e segue', () => {
    const req: any = { body: { reason: 'a'.repeat(REASON_MIN_LENGTH) } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('trim aplicado ao body.reason para os controllers consumirem normalizado', () => {
    const req: any = { body: { reason: '   onboarding via WhatsApp 2026   ' } };
    const res = buildRes();
    const next = jest.fn();
    withReason()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.reason).toBe('onboarding via WhatsApp 2026');
  });

  it('aceita minLength custom', () => {
    const req: any = { body: { reason: 'oi' } };
    const res = buildRes();
    const next = jest.fn();
    withReason(2)(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
