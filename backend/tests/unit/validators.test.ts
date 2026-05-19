import { parseDeadline, validateBrazilianPhone } from '../../src/utils/validators';

describe('Validators', () => {
  describe('validateBrazilianPhone', () => {
    it('should validate Brazilian phone with +55', () => {
      // +55 + 11 dígitos = 14 chars total (DDD 2 dígitos + 9 mobile + 8 = 11)
      expect(validateBrazilianPhone('+5564999999999')).toBe(true);
      expect(validateBrazilianPhone('+5511999999999')).toBe(true); // (fix do teste: era +55119999999999 com dígito extra)
    });

    it('should reject non-Brazilian phone', () => {
      expect(validateBrazilianPhone('+14155238886')).toBe(false);
      expect(validateBrazilianPhone('+5599999999')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(validateBrazilianPhone('64999999999')).toBe(false);
      expect(validateBrazilianPhone('5564999999999')).toBe(false);
    });
  });

  describe('parseDeadline (CO-S2-NEW AUD-05 fix)', () => {
    // Reference date fixo para testes determinísticos: terça-feira, 18/05/2026
    const REF = new Date(2026, 4, 18, 10, 0, 0, 0); // mês 4 = maio (0-indexed)

    it('parses "amanhã" with accent', () => {
      const result = parseDeadline('amanhã', REF);
      expect(result?.getDate()).toBe(19);
      expect(result?.getMonth()).toBe(4);
      expect(result?.getFullYear()).toBe(2026);
    });

    it('parses "amanha" without accent', () => {
      const result = parseDeadline('amanha', REF);
      expect(result?.getDate()).toBe(19);
    });

    it('parses "hoje" returning end-of-day', () => {
      const result = parseDeadline('hoje', REF);
      expect(result?.getDate()).toBe(18);
      expect(result?.getHours()).toBe(23);
      expect(result?.getMinutes()).toBe(59);
    });

    it('parses "em N dias"', () => {
      const result = parseDeadline('em 5 dias', REF);
      expect(result?.getDate()).toBe(23);
    });

    it('parses "daqui a N dias"', () => {
      const result = parseDeadline('daqui a 3 dias', REF);
      expect(result?.getDate()).toBe(21);
    });

    it('parses ISO "YYYY-MM-DD" with correct day (no UTC shift)', () => {
      // BUG histórico: '2024-12-31' virava 30/12 por causa de UTC midnight + BRT
      const result = parseDeadline('2024-12-31', REF);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(11);
      expect(result?.getDate()).toBe(31);
    });

    it('parses BR "DD/MM/YYYY"', () => {
      const result = parseDeadline('31/12/2024', REF);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(11);
      expect(result?.getDate()).toBe(31);
    });

    it('parses BR "DD/MM" using current year when date is in future', () => {
      // Em 18/05/2026, "31/12" deve ser 31/12/2026
      const result = parseDeadline('31/12', REF);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(11);
      expect(result?.getDate()).toBe(31);
    });

    it('parses BR "DD/MM" using NEXT year when date already passed', () => {
      // Em 18/05/2026, "01/01" deve ser 01/01/2027
      const result = parseDeadline('01/01', REF);
      expect(result?.getFullYear()).toBe(2027);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(1);
    });

    it('parses "sexta" returning next Friday from a Tuesday', () => {
      // REF é terça (dia 2). Próxima sexta é dia 5.
      const result = parseDeadline('sexta', REF);
      expect(result?.getDay()).toBe(5); // sexta-feira
      expect(result?.getDate()).toBe(22);
    });

    it('parses "sexta-feira" with hyphen', () => {
      const result = parseDeadline('sexta-feira', REF);
      expect(result?.getDay()).toBe(5);
    });

    it('parses "fim do mês"', () => {
      const result = parseDeadline('fim do mês', REF);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(4); // maio
      expect(result?.getDate()).toBe(31); // último dia de maio
    });

    it('returns null for invalid date "99/99/9999"', () => {
      expect(parseDeadline('99/99/9999', REF)).toBeNull();
    });

    it('returns null for invalid date "31/02/2026" (Feb has 28-29 days)', () => {
      expect(parseDeadline('31/02/2026', REF)).toBeNull();
    });

    it('returns null for "texto inválido"', () => {
      expect(parseDeadline('texto inválido', REF)).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(parseDeadline('', REF)).toBeNull();
      expect(parseDeadline('   ', REF)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(parseDeadline(null as any, REF)).toBeNull();
      expect(parseDeadline(undefined as any, REF)).toBeNull();
    });

    it('ignores extra whitespace', () => {
      expect(parseDeadline('  amanhã  ', REF)?.getDate()).toBe(19);
    });
  });
});
