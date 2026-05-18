/**
 * CO-0-07 — resolveCategoryValue agora normaliza para categorias de
 * MATERIAIS DE CONSTRUÇÃO (cimento, agregados, aço, blocos, ...).
 *
 * O arquivo `supplier-categories.ts` virou um shim de retrocompat que
 * re-exporta de `material-categories.ts`. Os testes legados (sementes,
 * fertilizantes, defensivos) foram reescritos para o novo domínio.
 */
import {
  resolveCategoryValue,
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABELS,
  findCanonicalCategoryLabel,
} from '../../../src/constants/supplier-categories';

describe('resolveCategoryValue (construção)', () => {
  it('value canônico passa direto', () => {
    expect(resolveCategoryValue('cimento')).toBe('cimento');
    expect(resolveCategoryValue('agregados')).toBe('agregados');
    expect(resolveCategoryValue('aco')).toBe('aco');
    expect(resolveCategoryValue('hidraulica')).toBe('hidraulica');
  });

  it('label Title Case / com acento → value canônico', () => {
    expect(resolveCategoryValue('Cimento e cal')).toBe('cimento');
    expect(resolveCategoryValue('Hidráulica (tubos, conexões, registros)')).toBe(
      'hidraulica',
    );
    expect(resolveCategoryValue('Aço e ferragens')).toBe('aco');
  });

  it('sem acento → value normalizado', () => {
    expect(resolveCategoryValue('hidraulica')).toBe('hidraulica');
    expect(resolveCategoryValue('Aco')).toBe('aco');
    expect(resolveCategoryValue('impermeabilizacao')).toBe('impermeabilizacao');
  });

  it('sinônimos comuns mapeiam para categoria certa', () => {
    expect(resolveCategoryValue('areia')).toBe('agregados');
    expect(resolveCategoryValue('brita')).toBe('agregados');
    expect(resolveCategoryValue('vergalhao')).toBe('aco');
    expect(resolveCategoryValue('tijolo')).toBe('blocos');
    expect(resolveCategoryValue('porcelanato')).toBe('revestimento');
    expect(resolveCategoryValue('telha')).toBe('cobertura');
    expect(resolveCategoryValue('tinta')).toBe('pintura');
    expect(resolveCategoryValue('drywall')).toBe('gesso');
  });

  it('case e espaço — trim + lowercase', () => {
    expect(resolveCategoryValue('  Cimento  ')).toBe('cimento');
    expect(resolveCategoryValue('CIMENTO')).toBe('cimento');
  });

  it('input inválido → undefined', () => {
    expect(resolveCategoryValue('blablabla')).toBeUndefined();
    expect(resolveCategoryValue('xyz')).toBeUndefined();
    expect(resolveCategoryValue('')).toBeUndefined();
    expect(resolveCategoryValue(null)).toBeUndefined();
    expect(resolveCategoryValue(undefined)).toBeUndefined();
    expect(resolveCategoryValue('   ')).toBeUndefined();
  });
});

describe('SUPPLIER_CATEGORIES (= MATERIAL_CATEGORIES)', () => {
  it('tem 17 categorias canônicas de construção', () => {
    expect(SUPPLIER_CATEGORIES.length).toBe(17);
    expect(SUPPLIER_CATEGORY_LABELS.length).toBe(17);
  });

  it('primeira categoria é cimento', () => {
    expect(SUPPLIER_CATEGORIES[0].value).toBe('cimento');
    expect(SUPPLIER_CATEGORIES[1].value).toBe('agregados');
    expect(SUPPLIER_CATEGORIES[2].value).toBe('aco');
  });

  it('contém "outros" para casos não-categorizáveis', () => {
    const values = SUPPLIER_CATEGORIES.map((c) => c.value);
    expect(values).toContain('outros');
  });
});

describe('findCanonicalCategoryLabel', () => {
  it('resolve label exato (case-insensitive)', () => {
    expect(findCanonicalCategoryLabel('cimento e cal')).toBe('Cimento e cal');
    expect(findCanonicalCategoryLabel('AÇO E FERRAGENS')).toBe('Aço e ferragens');
  });
});
