/**
 * Normalização canônica de telefone brasileiro.
 *
 * Formato de saída: +55DDXXXXXXXXX (com 9º dígito, sem espaços/hífens)
 * Exemplo: +5564999999999
 *
 * Variantes aceitas:
 *   - (64)99999-9999     → +5564999999999
 *   - 64 9 9999-9999     → +5564999999999
 *   - 6499999999         → +5564999999999 (8 dígitos → insere 9)
 *   - +556499999999      → +5564999999999 (10 dígitos → insere 9)
 *   - +5564999999999     → +5564999999999 (já normalizado)
 *   - 556499999999       → +5564999999999
 *
 * DDDs móveis brasileiros: 2 dígitos (11-99)
 * Celulares: 9 dígitos começando com 9
 *
 * Lança erro se o input não é um telefone brasileiro válido.
 */
export function normalizePhoneBR(input: string): string {
  // Remover tudo que não é dígito
  let digits = input.replace(/\D/g, '');

  // Se começa com 55 e tem 12+ dígitos, é DDI + DDD + número
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.substring(2); // remover DDI
  }

  // Neste ponto esperamos DDD (2 dígitos) + número (8 ou 9 dígitos) = 10 ou 11 dígitos
  if (digits.length < 10 || digits.length > 11) {
    throw new Error(`Telefone inválido: "${input}" — esperado DDD + número (10 ou 11 dígitos), recebido ${digits.length} dígitos`);
  }

  const ddd = digits.substring(0, 2);
  let number = digits.substring(2);

  // Inserir 9º dígito se necessário (celulares BR: 9 dígitos começando com 9)
  if (number.length === 8) {
    // Celulares com 8 dígitos — prefixar com 9
    number = '9' + number;
  }

  // Validar: 9 dígitos começando com 9
  if (number.length !== 9 || !number.startsWith('9')) {
    throw new Error(`Telefone inválido: "${input}" — número móvel deve ter 9 dígitos começando com 9`);
  }

  return `+55${ddd}${number}`;
}

/**
 * Versão segura que retorna null em vez de lançar erro.
 * Útil para validações de frontend ou migrações onde se deseja skip de registros inválidos.
 */
export function tryNormalizePhoneBR(input: string): string | null {
  try {
    return normalizePhoneBR(input);
  } catch {
    return null;
  }
}
