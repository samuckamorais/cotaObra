import { normalizeUnit } from '../../../src/utils/unit-normalizer';

describe('normalizeUnit (CotaObra — construção)', () => {
  describe('massa', () => {
    it.each(['kg', 'kgs', 'quilo', 'quilos', 'KG'])('"%s" → "kg"', (input) => {
      expect(normalizeUnit(input)).toBe('kg');
    });

    it.each(['t', 'ton', 'tonelada', 'toneladas', 'TON'])('"%s" → "Ton"', (input) => {
      expect(normalizeUnit(input)).toBe('Ton');
    });
  });

  describe('volume / dimensional', () => {
    it.each(['m', 'metro', 'metros', 'M'])('"%s" → "m"', (input) => {
      expect(normalizeUnit(input)).toBe('m');
    });

    it.each(['m2', 'metro quadrado', 'metros quadrados'])('"%s" → "m²"', (input) => {
      expect(normalizeUnit(input)).toBe('m²');
    });

    it.each(['m3', 'metro cubico', 'metros cúbicos'])('"%s" → "m³"', (input) => {
      expect(normalizeUnit(input)).toBe('m³');
    });

    it.each(['ml', 'metro linear', 'metros lineares'])('"%s" → "m linear"', (input) => {
      expect(normalizeUnit(input)).toBe('m linear');
    });

    it.each(['l', 'lt', 'lts', 'litro', 'litros', 'LITROS'])('"%s" → "litros"', (input) => {
      expect(normalizeUnit(input)).toBe('litros');
    });
  });

  describe('contagem e embalagem', () => {
    it.each(['un', 'unidade', 'unidades', 'UN'])('"%s" → "un"', (input) => {
      expect(normalizeUnit(input)).toBe('un');
    });

    it.each(['cx', 'caixa', 'caixas'])('"%s" → "caixa"', (input) => {
      expect(normalizeUnit(input)).toBe('caixa');
    });

    it.each(['saca', 'sacas', 'saco', 'sacos', 'sc', 'SACAS'])('"%s" → "saca"', (input) => {
      expect(normalizeUnit(input)).toBe('saca');
    });

    it.each(['fardo', 'fardos'])('"%s" → "fardo"', (input) => {
      expect(normalizeUnit(input)).toBe('fardo');
    });

    it.each(['rolo', 'rolos'])('"%s" → "rolo"', (input) => {
      expect(normalizeUnit(input)).toBe('rolo');
    });

    it.each(['balde', 'baldes'])('"%s" → "balde"', (input) => {
      expect(normalizeUnit(input)).toBe('balde');
    });

    it.each(['milheiro', 'milheiros'])('"%s" → "milheiro"', (input) => {
      expect(normalizeUnit(input)).toBe('milheiro');
    });
  });

  describe('legacy agro (compat)', () => {
    it.each(['bag', 'bags', 'big bag', 'big bags'])('"%s" → "Big Bags"', (input) => {
      expect(normalizeUnit(input)).toBe('Big Bags');
    });

    it.each(['ha', 'hectare', 'hectares'])('"%s" → "ha"', (input) => {
      expect(normalizeUnit(input)).toBe('ha');
    });

    it.each(['km', 'kms', 'quilometro', 'quilômetros'])('"%s" → "km"', (input) => {
      expect(normalizeUnit(input)).toBe('km');
    });
  });

  describe('fallback', () => {
    it('preserva unidade não reconhecida exatamente como o usuário digitou', () => {
      expect(normalizeUnit('canecas')).toBe('canecas');
    });

    it('retorna "unidades" para entrada vazia', () => {
      expect(normalizeUnit('')).toBe('unidades');
      expect(normalizeUnit('   ')).toBe('unidades');
      expect(normalizeUnit(null)).toBe('unidades');
      expect(normalizeUnit(undefined)).toBe('unidades');
    });
  });

  describe('idempotência', () => {
    it.each(['kg', 'Ton', 'm', 'm²', 'm³', 'litros', 'un', 'caixa', 'saca', 'rolo', 'balde'])(
      'aplicar duas vezes em "%s" não muda o resultado',
      (canonical) => {
        expect(normalizeUnit(normalizeUnit(canonical))).toBe(canonical);
      },
    );
  });
});
