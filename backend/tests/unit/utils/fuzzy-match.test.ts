import { levenshtein, fuzzyMatch } from '../../../src/utils/fuzzy-match';

describe('levenshtein', () => {
  it('retorna 0 para strings iguais', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('retorna comprimento para string vazia', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('retorna 1 para substituição de 1 char', () => {
    expect(levenshtein('abc', 'adc')).toBe(1);
  });

  it('retorna 1 para inserção de 1 char', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });

  it('retorna 1 para deleção de 1 char', () => {
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('calcula distância para palavras reais', () => {
    expect(levenshtein('rio verde', 'rio verd')).toBe(1);
    expect(levenshtein('sorriso', 'soriso')).toBe(1);
  });
});

describe('fuzzyMatch', () => {
  const cities = [
    'Rio Verde - GO',
    'Jataí - GO',
    'Sorriso - MT',
    'Lucas do Rio Verde - MT',
    'Cascavel - PR',
    'Londrina - PR',
  ];

  it('retorna match exato', () => {
    expect(fuzzyMatch('Rio Verde - GO', cities)).toBe('Rio Verde - GO');
  });

  it('retorna match case-insensitive', () => {
    expect(fuzzyMatch('rio verde - go', cities)).toBe('Rio Verde - GO');
  });

  it('retorna match parcial (abreviação)', () => {
    const result = fuzzyMatch('Rio Verde', cities);
    expect(result).toBe('Rio Verde - GO');
  });

  it('retorna match para typo', () => {
    const result = fuzzyMatch('Soriso - MT', cities);
    expect(result).toBe('Sorriso - MT');
  });

  it('retorna null se nenhum match supera threshold', () => {
    expect(fuzzyMatch('São Paulo - SP', cities, 0.9)).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(fuzzyMatch('', cities)).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(fuzzyMatch('Rio Verde', [])).toBeNull();
  });
});
