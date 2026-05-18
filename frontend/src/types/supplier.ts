/**
 * CO-1-08 — Categorias/Áreas de atuação dos fornecedores agora são as 17
 * categorias de MATERIAIS DE CONSTRUÇÃO (cf. data/material-categories.ts).
 *
 * Backwards-compat: o array exportado se chama SUPPLIER_CATEGORIES mas o
 * conteúdo é o de material-categories. Quando os componentes forem migrados
 * para importar direto de data/material-categories, este shim some.
 *
 * XLINKED → ../../../backend/src/constants/material-categories.ts
 */
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
} from '../data/material-categories';

export const SUPPLIER_CATEGORIES = MATERIAL_CATEGORIES;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number]['value'];

/**
 * Mapa de cores para badges de categorias (17 categorias de construção).
 */
export const CATEGORY_COLORS: Record<string, string> = {
  cimento: 'bg-stone-100 text-stone-800',
  agregados: 'bg-amber-100 text-amber-800',
  aco: 'bg-zinc-200 text-zinc-800',
  blocos: 'bg-orange-100 text-orange-800',
  concreto: 'bg-slate-100 text-slate-800',
  hidraulica: 'bg-blue-100 text-blue-800',
  eletrica: 'bg-yellow-100 text-yellow-800',
  gesso: 'bg-gray-100 text-gray-800',
  revestimento: 'bg-rose-100 text-rose-800',
  pintura: 'bg-pink-100 text-pink-800',
  cobertura: 'bg-red-100 text-red-800',
  esquadrias: 'bg-indigo-100 text-indigo-800',
  impermeabilizacao: 'bg-teal-100 text-teal-800',
  vidracaria: 'bg-cyan-100 text-cyan-800',
  ferramentas: 'bg-emerald-100 text-emerald-800',
  madeira: 'bg-yellow-100 text-yellow-900',
  outros: 'bg-neutral-100 text-neutral-800',
};

/**
 * Retorna o label legível de uma categoria pelo value canônico.
 */
export function getCategoryLabel(value: string): string {
  return MATERIAL_CATEGORY_LABEL[value] ?? value;
}
