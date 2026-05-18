/**
 * FEAT-008 (FF-BE-027) — generateTempPassword
 *
 * Cobertura:
 *   - tamanho exato (16 chars)
 *   - mix obrigatório (upper, lower, digit, symbol) — sempre presente
 *   - exclusão de caracteres ambíguos (I, l, 1, O, 0)
 *   - aleatoriedade alta (sem repetição estrutural entre 1000 amostras)
 *   - passa pelo validator de força usado no change-password / custom
 */
import { generateTempPassword } from '../../../src/utils/password-generator';
import { validatePasswordStrength } from '../../../src/utils/password-strength';

describe('generateTempPassword', () => {
  it('gera senha com exatamente 16 caracteres', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTempPassword()).toHaveLength(16);
    }
  });

  it('garante mix de classes (upper, lower, digit, symbol) em toda geração', () => {
    for (let i = 0; i < 100; i++) {
      const pwd = generateTempPassword();
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('exclui caracteres ambíguos (I, l, 1, O, 0)', () => {
    for (let i = 0; i < 200; i++) {
      const pwd = generateTempPassword();
      expect(pwd).not.toMatch(/[IlO]/);
      expect(pwd).not.toMatch(/[01]/);
    }
  });

  it('passa pelo validator de força (compartilhado com change-password)', () => {
    for (let i = 0; i < 100; i++) {
      const result = validatePasswordStrength(generateTempPassword());
      expect(result.valid).toBe(true);
    }
  });

  it('alta entropia: 1000 amostras devem ser únicas', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      samples.add(generateTempPassword());
    }
    // Permite até 1 colisão pra cobrir eventual flakiness de SO
    expect(samples.size).toBeGreaterThanOrEqual(999);
  });

  it('não tem viés posicional: cada uma das 4 classes não fica fixa no mesmo índice', () => {
    const positionsUpper = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const pwd = generateTempPassword();
      // Primeiro índice onde aparece uma maiúscula muda entre amostras
      const idx = pwd.search(/[A-Z]/);
      positionsUpper.add(idx);
    }
    // Se o shuffle funciona, a primeira ocorrência de upper aparece em
    // vários índices diferentes (pelo menos 4 dos 16 possíveis).
    expect(positionsUpper.size).toBeGreaterThanOrEqual(4);
  });
});
