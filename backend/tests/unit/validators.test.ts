import { parseDeadline, validateBrazilianPhone } from '../../src/utils/validators';

describe('Validators', () => {
  describe('validateBrazilianPhone', () => {
    it('should validate Brazilian phone with +55', () => {
      expect(validateBrazilianPhone('+5564999999999')).toBe(true);
      expect(validateBrazilianPhone('+55119999999999')).toBe(true);
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

  describe('parseDeadline', () => {
    it('should parse "amanhã"', () => {
      const result = parseDeadline('amanhã');
      expect(result).toBeInstanceOf(Date);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result?.getDate()).toBe(tomorrow.getDate());
    });

    it('should parse "em X dias"', () => {
      const result = parseDeadline('em 5 dias');
      expect(result).toBeInstanceOf(Date);
      const future = new Date();
      future.setDate(future.getDate() + 5);
      expect(result?.getDate()).toBe(future.getDate());
    });

    it('should parse ISO date', () => {
      const result = parseDeadline('2024-12-31');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(11); // December (0-indexed)
      expect(result?.getDate()).toBe(31);
    });

    it('should parse Brazilian date format', () => {
      const result = parseDeadline('31/12/2024');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(11);
      expect(result?.getDate()).toBe(31);
    });

    it('should return null for invalid input', () => {
      expect(parseDeadline('texto inválido')).toBeNull();
      expect(parseDeadline('99/99/9999')).toBeNull();
    });
  });
});
