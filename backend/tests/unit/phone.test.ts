import { normalizePhoneBR, tryNormalizePhoneBR } from '../../src/utils/phone';

describe('normalizePhoneBR', () => {
  describe('normalização de variantes', () => {
    const expected = '+5564999999999';

    it('normaliza formato com parênteses e hífen: (64)99999-9999', () => {
      expect(normalizePhoneBR('(64)99999-9999')).toBe(expected);
    });

    it('normaliza formato só dígitos sem DDI 10 dígitos: 6499999999', () => {
      expect(normalizePhoneBR('6499999999')).toBe(expected);
    });

    it('normaliza formato com DDI sem 9º dígito: +556499999999', () => {
      expect(normalizePhoneBR('+556499999999')).toBe(expected);
    });

    it('mantém formato já canônico: +5564999999999', () => {
      expect(normalizePhoneBR('+5564999999999')).toBe(expected);
    });

    it('normaliza formato com DDI sem +: 556499999999', () => {
      expect(normalizePhoneBR('556499999999')).toBe(expected);
    });

    it('normaliza formato com DDI completo sem +: 5564999999999', () => {
      expect(normalizePhoneBR('5564999999999')).toBe(expected);
    });

    it('normaliza formato com espaços: 64 9 9999 9999', () => {
      expect(normalizePhoneBR('64 9 9999 9999')).toBe(expected);
    });

    it('normaliza formato com pontos: 64.99999.9999', () => {
      expect(normalizePhoneBR('64.99999.9999')).toBe(expected);
    });

    it('normaliza formato misto: +55 (64) 9 9999-9999', () => {
      expect(normalizePhoneBR('+55 (64) 9 9999-9999')).toBe(expected);
    });
  });

  describe('outros DDDs', () => {
    it('normaliza DDD 11 (São Paulo)', () => {
      expect(normalizePhoneBR('11987654321')).toBe('+5511987654321');
    });

    it('normaliza DDD 21 (Rio) com 8 dígitos', () => {
      expect(normalizePhoneBR('2198765432')).toBe('+5521998765432');
    });
  });

  describe('validações', () => {
    it('lança erro para número muito curto', () => {
      expect(() => normalizePhoneBR('123456')).toThrow('Telefone inválido');
    });

    it('lança erro para número muito longo', () => {
      expect(() => normalizePhoneBR('+5564999999999999')).toThrow('Telefone inválido');
    });

    it('lança erro para string vazia', () => {
      expect(() => normalizePhoneBR('')).toThrow('Telefone inválido');
    });
  });
});

describe('tryNormalizePhoneBR', () => {
  it('retorna número normalizado para input válido', () => {
    expect(tryNormalizePhoneBR('(64)99999-9999')).toBe('+5564999999999');
  });

  it('retorna null para input inválido', () => {
    expect(tryNormalizePhoneBR('123')).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(tryNormalizePhoneBR('')).toBeNull();
  });
});
