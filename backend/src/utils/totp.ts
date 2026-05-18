import { generateSecret, generateURI, verifySync } from 'otplib';

/**
 * FEAT-008 (FF-BE-031) — Wrapper TOTP para Google Authenticator/Authy/1Password.
 *
 * Por que TOTP e não SMS/email:
 *   - Padrão da indústria (RFC 6238).
 *   - Imune a SIM swap.
 *   - Funciona offline depois do enrollment.
 *
 * Configuração (defaults do otplib v13, explícitos pra não depender do default):
 *   - 30 segundos por step
 *   - 6 dígitos
 *   - SHA1 (única algorithm que Google Authenticator suporta)
 *   - epochTolerance 30s = ±1 step (cobre clock drift até ±30s sem perder segurança)
 */

const ISSUER = 'CotaObra';
const TOTP_ALGO = 'sha1';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_TOLERANCE_SECONDS = 30; // ±1 step

/**
 * Gera um secret em base32 (~160 bits de entropia — mais que suficiente).
 */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * Constrói a URL otpauth:// que vira QR code no app autenticador.
 * Formato: otpauth://totp/CotaObra:<email>?secret=<base32>&issuer=CotaObra&...
 */
export function buildOtpAuthUrl(accountIdentifier: string, secret: string): string {
  return generateURI({
    strategy: 'totp',
    issuer: ISSUER,
    label: accountIdentifier,
    secret,
    algorithm: TOTP_ALGO,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
}

/**
 * Valida um código TOTP de 6 dígitos contra o secret armazenado.
 * Aceita string com espaços/zero-prefixados.
 *
 * verifySync retorna { valid, delta, epoch, timeStep } — extraímos só valid.
 */
export function verifyTotp(secret: string, token: string): boolean {
  try {
    const result = verifySync({
      strategy: 'totp',
      token: token.replace(/\s+/g, ''),
      secret,
      algorithm: TOTP_ALGO,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      epochTolerance: TOTP_TOLERANCE_SECONDS,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}
