import {
  trackFieldAttempt,
  resetFieldAttempts,
} from '../../../src/services/anti-loop.service';

describe('trackFieldAttempt', () => {
  it('primeira tentativa não dispara escape', () => {
    const r = trackFieldAttempt({}, 'region');
    expect(r.escapeMessage).toBeNull();
    expect(r.attempts).toBe(1);
  });

  it('segunda tentativa no mesmo campo incrementa para 2', () => {
    const r1 = trackFieldAttempt({}, 'region');
    const r2 = trackFieldAttempt(r1.context, 'region');
    expect(r2.attempts).toBe(2);
    expect(r2.escapeMessage).toBeNull();
  });

  it('terceira tentativa no mesmo campo dispara escape', () => {
    let ctx = trackFieldAttempt({}, 'region').context;
    ctx = trackFieldAttempt(ctx, 'region').context;
    const r3 = trackFieldAttempt(ctx, 'region');
    expect(r3.attempts).toBe(3);
    expect(r3.escapeMessage).not.toBeNull();
    expect(r3.escapeMessage).toContain('região');
    expect(r3.escapeMessage).toContain('Falar com a equipe');
  });

  it('trocar de campo zera contadores', () => {
    let ctx = trackFieldAttempt({}, 'region').context;
    ctx = trackFieldAttempt(ctx, 'region').context;
    const r3 = trackFieldAttempt(ctx, 'deadline'); // outro campo
    expect(r3.attempts).toBe(1);
    expect(r3.escapeMessage).toBeNull();
  });

  it('escape message inclui label legível para campo', () => {
    let ctx = trackFieldAttempt({}, 'product').context;
    ctx = trackFieldAttempt(ctx, 'product').context;
    const r3 = trackFieldAttempt(ctx, 'product');
    expect(r3.escapeMessage).toContain('produto');
  });

  it('campo desconhecido usa próprio nome', () => {
    let ctx = trackFieldAttempt({}, 'fooBar').context;
    ctx = trackFieldAttempt(ctx, 'fooBar').context;
    const r3 = trackFieldAttempt(ctx, 'fooBar');
    expect(r3.escapeMessage).toContain('fooBar');
  });
});

describe('resetFieldAttempts', () => {
  it('remove contadores e lastAskedField', () => {
    let ctx = trackFieldAttempt({}, 'region').context;
    ctx = trackFieldAttempt(ctx, 'region').context;
    const reset = resetFieldAttempts(ctx);
    expect((reset as any)._attemptsPerField).toBeUndefined();
    expect((reset as any)._lastAskedField).toBeUndefined();
  });

  it('preserva outros campos do contexto', () => {
    const ctx = trackFieldAttempt(
      { region: 'Rio Verde', freight: 'CIF' as const },
      'deadline',
    ).context;
    const reset = resetFieldAttempts(ctx);
    expect(reset.region).toBe('Rio Verde');
    expect(reset.freight).toBe('CIF');
  });
});
