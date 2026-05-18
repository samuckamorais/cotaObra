import { z } from 'zod';
import { normalizePhoneBR } from './phone';

// ===================================
// CPF/CNPJ Validation
// ===================================

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
    sum += parseInt(digits[i]) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(digits[10])) return false;

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
    sum += parseInt(digits[i]) * pos;
    pos = pos === 2 ? 9 : pos - 1;
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(digits[12])) return false;

  sum = 0;
  pos = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * pos;
    pos = pos === 2 ? 9 : pos - 1;
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(digits[13])) return false;

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
 * Schema Zod para CPF/CNPJ
 */
export const cpfCnpjSchema = z
  .string()
  .min(11, 'CPF/CNPJ inválido')
  .max(18, 'CPF/CNPJ inválido')
  .transform((value: string) => removeNonDigits(value))
  .refine((value: string) => isValidCpfCnpj(value), 'CPF/CNPJ inválido');

// ===================================
// Phone Validation
// ===================================

/**
 * Valida e normaliza número de telefone brasileiro.
 * Aceita variantes e normaliza para +55DDXXXXXXXXX (com 9º dígito).
 */
export const phoneSchema = z
  .string()
  .min(10, 'Telefone deve ter pelo menos 10 dígitos')
  .transform((phone: string) => normalizePhoneBR(phone.trim()));

/**
 * Valida se o telefone é brasileiro no formato canônico.
 */
export const validateBrazilianPhone = (phone: string): boolean => {
  return /^\+55\d{11}$/.test(phone);
};

// ===================================
// Date Validation
// ===================================

/**
 * Valida que a data é futura
 */
export const futureDateSchema = z.coerce
  .date()
  .refine((date: Date) => date > new Date(), 'Data deve ser futura');

/**
 * Parse de deadline em português
 * Aceita: "2024-03-30", "30/03/2024", "em 3 dias", "amanhã"
 */
export const parseDeadline = (input: string): Date | null => {
  const normalized = input.toLowerCase().trim();

  // "amanhã"
  if (normalized === 'amanhã' || normalized === 'amanha') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // "em X dias"
  const daysMatch = normalized.match(/em\s+(\d+)\s+dias?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return futureDate;
  }

  // "daqui a X dias"
  const daysMatch2 = normalized.match(/daqui\s+a\s+(\d+)\s+dias?/);
  if (daysMatch2) {
    const days = parseInt(daysMatch2[1]);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return futureDate;
  }

  // "hoje" (hoje + 23:59)
  if (normalized === 'hoje') {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  }

  // Formato ISO: "2024-03-30"
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(normalized);
  }

  // Formato brasileiro: "30/03/2024"
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('/');
    return new Date(`${year}-${month}-${day}`);
  }

  return null;
};

// ===================================
// Producer Validation
// ===================================

export const createProducerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  cpfCnpj: cpfCnpjSchema,
  stateRegistration: z.string().optional(),
  farm: z.string().optional(),
  city: z.string().min(2, 'Município deve ter no mínimo 2 caracteres'),
  phone: phoneSchema,
  region: z.string().min(2, 'Região deve ter no mínimo 2 caracteres'),
});

export const updateProducerSchema = z.object({
  name: z.string().min(3).optional(),
  cpfCnpj: cpfCnpjSchema.optional(),
  stateRegistration: z.string().optional(),
  farm: z.string().optional(),
  city: z.string().min(2).optional(),
  phone: phoneSchema.optional(),
  region: z.string().min(2).optional(),
});

// ===================================
// Supplier Validation
// ===================================

export const createSupplierSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  phone: phoneSchema,
  regions: z.array(z.string()).min(1, 'Informe ao menos uma região'),
  categories: z.array(z.string()).min(1, 'Informe ao menos uma categoria'),
  isNetworkSupplier: z.boolean().optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(3).optional(),
  phone: phoneSchema.optional(),
  regions: z.array(z.string()).min(1).optional(),
  categories: z.array(z.string()).min(1).optional(),
  isNetworkSupplier: z.boolean().optional(),
});

// ===================================
// Quote Validation
// ===================================

export const createQuoteSchema = z.object({
  producerId: z.string().uuid(),
  product: z.string().min(2, 'Produto deve ter no mínimo 2 caracteres'),
  quantity: z.string().min(1, 'Quantidade é obrigatória'),
  unit: z.string().min(1, 'Unidade é obrigatória'),
  region: z.string().min(2, 'Região é obrigatória'),
  deadline: futureDateSchema,
  observations: z.string().optional(),
  supplierScope: z.enum(['MINE', 'NETWORK', 'ALL']),
});

// ===================================
// Proposal Validation
// ===================================

export const createProposalSchema = z.object({
  quoteId: z.string().uuid(),
  supplierId: z.string().uuid(),
  price: z.number().positive('Preço deve ser positivo'),
  totalPrice: z.number().positive('Preço total deve ser positivo'),
  paymentTerms: z.string().min(3, 'Condição de pagamento é obrigatória'),
  deliveryDays: z.number().int().positive('Prazo de entrega deve ser positivo'),
  observations: z.string().optional(),
  isOwnSupplier: z.boolean().optional(),
});

// ===================================
// Subscription Validation
// ===================================

export const createSubscriptionSchema = z.object({
  producerId: z.string().uuid(),
  plan: z.enum(['BASIC', 'PRO', 'ENTERPRISE']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// ===================================
// Pagination Validation
// ===================================

export const paginationSchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('10').transform(Number),
});

/**
 * Valida que limit está entre 1 e 100
 */
export const validatePaginationLimit = (limit: number): number => {
  return Math.max(1, Math.min(limit, 100));
};
