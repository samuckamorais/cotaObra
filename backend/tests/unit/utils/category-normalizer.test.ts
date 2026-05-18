import { normalizeCategoryName } from '../../../src/utils/category-normalizer';

describe('normalizeCategoryName', () => {
  it.each([
    ['sementes', 'Sementes'],
    ['SEMENTES', 'Sementes'],
    ['Sementes', 'Sementes'],
    ['SeMeNtEs', 'Sementes'],
    ['  sementes  ', 'Sementes'],
    ['fertilizantes', 'Fertilizantes'],
    ['defensivos', 'Defensivos'],
    ['rações', 'Rações'],
    ['cana-de-açúcar', 'Cana-de-açúcar'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalizeCategoryName(input)).toBe(expected);
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(normalizeCategoryName('')).toBe('');
  });

  it('retorna string vazia para apenas espaços', () => {
    expect(normalizeCategoryName('   ')).toBe('');
  });

  it('aceita null e undefined retornando vazio', () => {
    expect(normalizeCategoryName(null)).toBe('');
    expect(normalizeCategoryName(undefined)).toBe('');
  });

  it('é idempotente — aplicar duas vezes produz o mesmo resultado', () => {
    const first = normalizeCategoryName('SEMENTES');
    const second = normalizeCategoryName(first);
    expect(second).toBe(first);
  });
});
