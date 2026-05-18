import crypto from 'crypto';

/**
 * FEAT-008 (FF-BE-027) — Gerador de senha temporária para cadastro
 * de novos usuários pelo SUPER_ADMIN.
 *
 * RN-01: 16 chars, mix obrigatório de maiúsculas, minúsculas, dígitos e
 * símbolos. Exclui caracteres ambíguos (I, l, 1, O, 0) para reduzir erros
 * quando o super admin dita por telefone ou o cliente digita errado.
 *
 * Aleatoriedade: crypto.randomInt (CSPRNG). NÃO use Math.random aqui —
 * senha temp aparece UMA vez na response e precisa resistir a tentativa
 * de adivinhação enquanto o cliente não troca.
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I, O
const LOWER = 'abcdefghjkmnopqrstuvwxyz'; // sem l
const DIGIT = '23456789'; // sem 0, 1
const SYMBOL = '!@#$%&*-_+=';

const PASSWORD_LENGTH = 16;

export function generateTempPassword(): string {
  const allChars = UPPER + LOWER + DIGIT + SYMBOL;
  // Garante pelo menos 1 char de cada classe (atende a força mínima do
  // validatePasswordStrength sem depender de sorte).
  const pwd: string[] = [
    UPPER[crypto.randomInt(UPPER.length)],
    LOWER[crypto.randomInt(LOWER.length)],
    DIGIT[crypto.randomInt(DIGIT.length)],
    SYMBOL[crypto.randomInt(SYMBOL.length)],
  ];
  for (let i = pwd.length; i < PASSWORD_LENGTH; i++) {
    pwd.push(allChars[crypto.randomInt(allChars.length)]);
  }
  // Fisher-Yates shuffle — sem viés posicional dos 4 chars iniciais.
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
}
