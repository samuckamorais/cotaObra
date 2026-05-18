/**
 * CotaObra — Backward-compat shim para supplier-categories.
 *
 * CO-0-07: o catálogo agora vive em `material-categories.ts` (categorias
 * de construção). Este arquivo apenas re-exporta os nomes antigos
 * (`SUPPLIER_CATEGORIES`, `SUPPLIER_CATEGORY_LABELS`) para que os imports
 * existentes (FSM, services, frontend) continuem compilando sem alteração.
 *
 * Em Sprint 1 cada call site será migrado para `material-categories.ts` e
 * este arquivo será deletado.
 */
export {
  MATERIAL_CATEGORIES as SUPPLIER_CATEGORIES,
  MATERIAL_CATEGORY_LABELS as SUPPLIER_CATEGORY_LABELS,
  findCanonicalCategoryLabel,
  resolveCategoryValue,
} from './material-categories';
