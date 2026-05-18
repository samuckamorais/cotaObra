/**
 * FEAT-008 (FF-BE-031) — Wrapper TOTP
 *
 * Mockamos `otplib` aqui porque a v13 traz deps ESM-only (@scure/base)
 * que o ts-jest CJS não consegue importar. O wrapper é testado por
 * contrato — confiamos na otplib pra implementação correta de RFC 6238.
 *
 * Validação end-to-end (token real gerado por app autenticador) é feita
 * no smoke test manual em staging.
 */
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn(
    ({ issuer, label, secret }: any) =>
      `otpauth://totp/${issuer}:${encodeURIComponent(label)}?secret=${secret}&issuer=${issuer}`,
  ),
  verifySync: jest.fn((opts: any) => ({
    valid: opts.token === '123456',
    delta: 0,
  })),
}));

import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from '../../../src/utils/totp';

describe('generateTotpSecret', () => {
  it('delega ao otplib e retorna o secret gerado', () => {
    const s = generateTotpSecret();
    expect(s).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('buildOtpAuthUrl', () => {
  it('monta URL otpauth:// com issuer CotaObra + label do email', () => {
    const url = buildOtpAuthUrl('cotaobrabr@gmail.com', 'JBSWY3DPEHPK3PXP');
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('CotaObra');
    expect(url).toContain('cotaobrabr%40gmail.com');
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
  });
});

describe('verifyTotp', () => {
  it('retorna true quando otplib reporta valid:true', () => {
    expect(verifyTotp('SECRET', '123456')).toBe(true);
  });

  it('retorna false para qualquer outro token (mock só aceita "123456")', () => {
    expect(verifyTotp('SECRET', '999999')).toBe(false);
    expect(verifyTotp('SECRET', '000000')).toBe(false);
  });

  it('normaliza espaços antes de validar', () => {
    expect(verifyTotp('SECRET', '123 456')).toBe(true);
  });

  it('rejeita string vazia sem lançar', () => {
    expect(verifyTotp('SECRET', '')).toBe(false);
  });
});
