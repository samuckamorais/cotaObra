import { z } from 'zod';
import { normalizePhoneBR } from './phone';
import {
  MATERIAL_CATEGORY_VALUES,
  resolveCategoryValue,
} from '../constants/material-categories';

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
 * Parse de deadline em português brasileiro.
 *
 * CO-S2-NEW (AUD-05): reescrito para corrigir bugs herdados do cotaAgro:
 *  - `new Date('YYYY-MM-DD')` é UTC-midnight e em BRT (-03:00) vira o dia
 *    anterior. Agora usamos construção local `new Date(y, m-1, d)`.
 *  - `new Date('99/99/9999')` antes retornava Date com NaN sem o caller
 *    perceber. Agora validamos o resultado.
 *
 * Aceita:
 *  - "amanhã" / "amanha"
 *  - "hoje" (até 23:59:59)
 *  - "em N dias" / "daqui a N dias"
 *  - "sexta", "segunda", … (próxima ocorrência futura)
 *  - "fim do mês" / "fim de mes"
 *  - ISO "YYYY-MM-DD"
 *  - BR "DD/MM/YYYY" e "DD/MM" (ano implícito: corrente ou próximo se já passou)
 *
 * @param input  string crua (input do usuário)
 * @param ref    data de referência (default: agora) — útil em testes
 */
export const parseDeadline = (input: string, ref: Date = new Date()): Date | null => {
  if (!input || typeof input !== 'string') return null;
  const normalized = input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos

  // -------- "hoje" --------
  if (normalized === 'hoje') {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    return d;
  }

  // -------- "amanha" --------
  if (normalized === 'amanha') {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1, 12, 0, 0, 0);
    return d;
  }

  // -------- "em N dias" / "daqui a N dias" --------
  const daysMatch =
    normalized.match(/em\s+(\d+)\s+dias?/) ?? normalized.match(/daqui\s+a\s+(\d+)\s+dias?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (!Number.isFinite(days) || days < 0 || days > 365) return null;
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + days, 12, 0, 0, 0);
  }

  // -------- "fim do mes" --------
  if (normalized === 'fim do mes' || normalized === 'final do mes') {
    // último dia do mês de ref
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12, 0, 0, 0);
    return last;
  }

  // -------- dia da semana ("sexta", "segunda", etc.) --------
  const WEEKDAYS: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    'segunda-feira': 1,
    terca: 2,
    'terca-feira': 2,
    quarta: 3,
    'quarta-feira': 3,
    quinta: 4,
    'quinta-feira': 4,
    sexta: 5,
    'sexta-feira': 5,
    sabado: 6,
  };
  const wdKey = Object.keys(WEEKDAYS).find((k) => normalized === k || normalized === k + 's');
  if (wdKey !== undefined) {
    const target = WEEKDAYS[wdKey];
    const today = ref.getDay();
    let diff = target - today;
    if (diff <= 0) diff += 7; // se hoje é sexta e pedi "sexta", vai pra próxima
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff, 12, 0, 0, 0);
  }

  // -------- ISO "YYYY-MM-DD" --------
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return buildValidLocalDate(y, m, d);
  }

  // -------- BR "DD/MM/YYYY" --------
  const brFullMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brFullMatch) {
    const d = parseInt(brFullMatch[1], 10);
    const m = parseInt(brFullMatch[2], 10);
    const y = parseInt(brFullMatch[3], 10);
    return buildValidLocalDate(y, m, d);
  }

  // -------- BR "DD/MM" (ano implícito) --------
  const brShortMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (brShortMatch) {
    const d = parseInt(brShortMatch[1], 10);
    const m = parseInt(brShortMatch[2], 10);
    const yCandidate = ref.getFullYear();
    const candidate = buildValidLocalDate(yCandidate, m, d);
    if (!candidate) return null;
    // Se já passou neste ano, assume próximo ano
    if (candidate.getTime() < ref.getTime() - 60_000) {
      return buildValidLocalDate(yCandidate + 1, m, d);
    }
    return candidate;
  }

  return null;
};

/**
 * Constrói Date local validando que os componentes batem.
 * Retorna null se a data for inválida (ex: 31/02, 99/99).
 */
function buildValidLocalDate(year: number, month: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1900 || year > 2200) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  // Verifica que JavaScript não "ajustou" (ex: 31/02 vira 03/03)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

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

/**
 * CO-1-08 — valida que cada categoria está em MATERIAL_CATEGORIES.
 * Aceita value canônico ou label/sinônimo (resolveCategoryValue normaliza).
 * Retorna array de values canônicos.
 */
const supplierCategoriesSchema = z
  .array(z.string())
  .min(1, 'Informe ao menos uma categoria')
  .transform((arr, ctx) => {
    const resolved: string[] = [];
    for (const cat of arr) {
      const v = resolveCategoryValue(cat);
      if (!v) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Categoria "${cat}" não está na lista de MATERIAL_CATEGORIES`,
        });
        return z.NEVER;
      }
      resolved.push(v);
    }
    // Dedup
    return Array.from(new Set(resolved));
  })
  .pipe(
    z
      .array(z.enum(MATERIAL_CATEGORY_VALUES as unknown as [string, ...string[]]))
      .min(1),
  );

export const createSupplierSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  phone: phoneSchema,
  regions: z.array(z.string()).min(1, 'Informe ao menos uma região'),
  categories: supplierCategoriesSchema,
  isNetworkSupplier: z.boolean().optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(3).optional(),
  phone: phoneSchema.optional(),
  regions: z.array(z.string()).min(1).optional(),
  categories: supplierCategoriesSchema.optional(),
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
