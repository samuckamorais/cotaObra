/**
 * Remove caracteres não numéricos
 */
const removeNonDigits = (value: string): string => value.replace(/\D/g, '');

/**
 * Valida CPF
 */
export const isValidCPF = (cpf: string): boolean => {
  const digits = removeNonDigits(cpf);

  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // rejeita sequências iguais (111.111.111-11)

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]!) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(digits[9]!)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]!) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(digits[10]!)) return false;

  return true;
};

/**
 * Valida CNPJ
 */
export const isValidCNPJ = (cnpj: string): boolean => {
  const digits = removeNonDigits(cnpj);

  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // rejeita sequências iguais

  let sum = 0;
  let pos = 5;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]!) * pos;
    pos = pos === 2 ? 9 : pos - 1;
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(digits[12]!)) return false;

  sum = 0;
  pos = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]!) * pos;
    pos = pos === 2 ? 9 : pos - 1;
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(digits[13]!)) return false;

  return true;
};

/**
 * Valida CPF ou CNPJ
 */
export const isValidCpfCnpj = (value: string): boolean => {
  const digits = removeNonDigits(value);

  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);

  return false;
};

/**
 * Formata CPF ou CNPJ
 */
export const formatCpfCnpj = (value: string): string => {
  const digits = removeNonDigits(value);

  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    // CNPJ: 00.000.000/0000-00
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
};
