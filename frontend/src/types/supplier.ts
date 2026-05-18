/**
 * Categorias/Áreas de atuação dos fornecedores.
 *
 * XLINKED → ../../../backend/src/constants/supplier-categories.ts
 * Os dois arquivos têm os MESMOS values/labels e DEVEM ser mantidos
 * sincronizados manualmente. Se mudar aqui, mude lá (e vice-versa).
 * A unificação física (codegen ou pacote shared) está prevista numa
 * task futura (sugestão: FF-BE-026).
 */
export const SUPPLIER_CATEGORIES = [
  { value: 'semente', label: 'Semente' },
  { value: 'fertilizante', label: 'Fertilizante' },
  { value: 'foliar', label: 'Foliar' },
  { value: 'defensivo', label: 'Defensivo' },
  { value: 'calcario', label: 'Calcário' },
  { value: 'gesso', label: 'Gesso' },
  { value: 'combustivel', label: 'Combustível' },
  { value: 'implementos', label: 'Implementos' },
  { value: 'frete', label: 'Frete' },
  { value: 'insumos_geral', label: 'Insumos em Geral' },
] as const;

export type SupplierCategory = typeof SUPPLIER_CATEGORIES[number]['value'];

/**
 * Mapa de cores para badges de categorias
 */
export const CATEGORY_COLORS: Record<string, string> = {
  semente: 'bg-green-100 text-green-800',
  fertilizante: 'bg-yellow-100 text-yellow-800',
  foliar: 'bg-lime-100 text-lime-800',
  defensivo: 'bg-red-100 text-red-800',
  calcario: 'bg-gray-100 text-gray-800',
  gesso: 'bg-slate-100 text-slate-800',
  combustivel: 'bg-orange-100 text-orange-800',
  implementos: 'bg-blue-100 text-blue-800',
  frete: 'bg-purple-100 text-purple-800',
  insumos_geral: 'bg-cyan-100 text-cyan-800',
};

/**
 * Retorna o label de uma categoria pelo value
 */
export function getCategoryLabel(value: string): string {
  const category = SUPPLIER_CATEGORIES.find((c) => c.value === value);
  return category?.label || value;
}
