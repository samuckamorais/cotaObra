/**
 * FEAT-008 (FF-BE-027) — validatePasswordStrength
 *
 * Regras (RN-01b / RN-05):
 *   - >= 10 chars
 *   - >= 1 maiúscula
 *   - >= 1 minúscula
 *   - >= 1 dígito
 *   - >= 1 símbolo (qualquer não-alfanumérico)
 *
 * Cenários BDD relevantes da spec:
 *   - Cenário 11: senha custom válida → cria user
 *   - Cenário 12: senha custom fraca → 400 (nada é persistido)
 */
import {
  validatePasswordStrength,
  PASSWORD_MIN_LENGTH,
} from '../../../src/utils/password-strength';

describe('validatePasswordStrength — válidas', () => {
  it.each([
    'MinhaSenha123!',
    'Aa1!Aa1!Aa1!',
    'Sup3r@dmin2026',
    'P@ssword123ABC',
  ])('"%s" passa', (pwd) => {
    expect(validatePasswordStrength(pwd)).toEqual({ valid: true });
  });
});

describe('validatePasswordStrength — rejeita por motivo', () => {
  it(`< ${PASSWORD_MIN_LENGTH} chars → reason de tamanho`, () => {
    const r = validatePasswordStrength('Aa1!short');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no mínimo .* caracteres/);
  });

  it('sem maiúscula → reason específica', () => {
    const r = validatePasswordStrength('senhalonga123!');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/letra maiúscula/);
  });

  it('sem minúscula → reason específica', () => {
    const r = validatePasswordStrength('SENHALONGA123!');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/letra minúscula/);
  });

  it('sem dígito → reason específica', () => {
    const r = validatePasswordStrength('SenhaLonga!!');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/dígito/);
  });

  it('sem símbolo → reason específica', () => {
    const r = validatePasswordStrength('SenhaLonga123');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/símbolo/);
  });

  it('cenário 12 da spec: "1234" é fraca em múltiplas dimensões', () => {
    const r = validatePasswordStrength('1234');
    expect(r.valid).toBe(false);
    // A primeira regra a falhar é a de tamanho — não validamos qual reason
    // específica saiu, só que rejeitou.
  });
});

describe('validatePasswordStrength — tipos inválidos', () => {
  it.each([null, undefined, 42, {}, []])('não-string %p → invalid', (value) => {
    const r = validatePasswordStrength(value as unknown);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/string/i);
  });
});
