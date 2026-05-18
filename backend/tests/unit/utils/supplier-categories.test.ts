/**
 * FF-BE-024 — resolveCategoryValue: normalização de input do produtor
 * em VALUE canônico da SUPPLIER_CATEGORIES.
 */
import {
  resolveCategoryValue,
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABELS,
  findCanonicalCategoryLabel,
} from '../../../src/constants/supplier-categories';

describe('resolveCategoryValue', () => {
  it('value canônico passa direto', () => {
    expect(resolveCategoryValue('defensivo')).toBe('defensivo');
    expect(resolveCategoryValue('calcario')).toBe('calcario');
    expect(resolveCategoryValue('insumos_geral')).toBe('insumos_geral');
  });

  it('label Title Case → value', () => {
    expect(resolveCategoryValue('Defensivo')).toBe('defensivo');
    expect(resolveCategoryValue('Calcário')).toBe('calcario');
    expect(resolveCategoryValue('Insumos em Geral')).toBe('insumos_geral');
  });

  it('Cenário 5: plural simples → singular canônico', () => {
    expect(resolveCategoryValue('Defensivos')).toBe('defensivo');
    expect(resolveCategoryValue('Sementes')).toBe('semente');
    expect(resolveCategoryValue('fertilizantes')).toBe('fertilizante');
  });

  it('Cenário 6: sem acento → value com diacrítico canonizado', () => {
    expect(resolveCategoryValue('calcario')).toBe('calcario');
    expect(resolveCategoryValue('Calcario')).toBe('calcario');
    expect(resolveCategoryValue('combustivel')).toBe('combustivel');
    expect(resolveCategoryValue('Combustível')).toBe('combustivel');
  });

  it('case e espaço — trim + lowercase', () => {
    expect(resolveCategoryValue('  Defensivo  ')).toBe('defensivo');
    expect(resolveCategoryValue('DEFENSIVO')).toBe('defensivo');
  });

  it('input inválido → undefined', () => {
    expect(resolveCategoryValue('blablabla')).toBeUndefined();
    expect(resolveCategoryValue('xyz')).toBeUndefined();
    expect(resolveCategoryValue('')).toBeUndefined();
    expect(resolveCategoryValue(null)).toBeUndefined();
    expect(resolveCategoryValue(undefined)).toBeUndefined();
    expect(resolveCategoryValue('   ')).toBeUndefined();
  });

  it('não confunde labels parecidos (insumos vs insumos_geral)', () => {
    // "insumos" sozinho não casa com label "Insumos em Geral"
    expect(resolveCategoryValue('insumos')).toBeUndefined();
    // mas o nome completo casa
    expect(resolveCategoryValue('Insumos em Geral')).toBe('insumos_geral');
  });
});

describe('SUPPLIER_CATEGORY_LABELS — invariantes', () => {
  it('tem exatamente 10 categorias canônicas', () => {
    expect(SUPPLIER_CATEGORIES.length).toBe(10);
    expect(SUPPLIER_CATEGORY_LABELS.length).toBe(10);
  });

  it('ordem dos labels segue ordem dos values (cenário 2: "1" → "semente")', () => {
    expect(SUPPLIER_CATEGORIES[0].value).toBe('semente');
    expect(SUPPLIER_CATEGORIES[1].value).toBe('fertilizante');
    expect(SUPPLIER_CATEGORIES[2].value).toBe('foliar');
    expect(SUPPLIER_CATEGORIES[3].value).toBe('defensivo');
  });
});

describe('findCanonicalCategoryLabel (não regredido)', () => {
  it('continua resolvendo label exato', () => {
    expect(findCanonicalCategoryLabel('defensivo')).toBe('Defensivo');
    expect(findCanonicalCategoryLabel('CALCÁRIO')).toBe('Calcário');
  });
});
