/**
 * FEAT-008 (FF-BE-027) — Validador de força de senha compartilhado.
 *
 * Usado em 3 lugares (próximo checkpoint):
 *   1) POST /api/admin/users         — senha custom passada pelo super admin
 *   2) POST /api/admin/users/:id/reset-password — senha custom no reset
 *   3) POST /api/auth/change-password — senha nova definida pelo próprio user
 *
 * RN-01b / RN-05: a regra é IDÊNTICA em todos os caminhos para evitar que o
 * super admin defina senhas mais fracas que o cliente pode definir depois.
 */

export interface PasswordStrengthResult {
  valid: boolean;
  /** Mensagem amigável em pt-BR explicando o que falta. Só presente quando valid=false. */
  reason?: string;
}

export const PASSWORD_MIN_LENGTH = 10;

export function validatePasswordStrength(pwd: unknown): PasswordStrengthResult {
  if (typeof pwd !== 'string') {
    return { valid: false, reason: 'Senha deve ser uma string.' };
  }
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      reason: `Senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (!/[A-Z]/.test(pwd)) {
    return { valid: false, reason: 'Senha deve ter pelo menos 1 letra maiúscula.' };
  }
  if (!/[a-z]/.test(pwd)) {
    return { valid: false, reason: 'Senha deve ter pelo menos 1 letra minúscula.' };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, reason: 'Senha deve ter pelo menos 1 dígito.' };
  }
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    return { valid: false, reason: 'Senha deve ter pelo menos 1 símbolo.' };
  }
  return { valid: true };
}
