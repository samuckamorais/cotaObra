/**
 * CO-1 frontend — espelho de backend/src/constants/material-categories.ts.
 * Mantém sincronizado manualmente até unificação em pacote shared (task futura).
 */
export const MATERIAL_CATEGORIES = [
  { value: 'cimento', label: 'Cimento e cal' },
  { value: 'agregados', label: 'Agregados (areia, brita, pedrisco)' },
  { value: 'aco', label: 'Aço e ferragens' },
  { value: 'blocos', label: 'Blocos, tijolos e lajotas' },
  { value: 'concreto', label: 'Concreto usinado e argamassa' },
  { value: 'hidraulica', label: 'Hidráulica (tubos, conexões, registros)' },
  { value: 'eletrica', label: 'Elétrica (fios, eletrodutos, quadros)' },
  { value: 'gesso', label: 'Gesso e drywall' },
  { value: 'revestimento', label: 'Revestimento cerâmico e porcelanato' },
  { value: 'pintura', label: 'Tintas e vernizes' },
  { value: 'cobertura', label: 'Telhas e cobertura' },
  { value: 'esquadrias', label: 'Esquadrias (portas, janelas)' },
  { value: 'impermeabilizacao', label: 'Impermeabilização' },
  { value: 'vidracaria', label: 'Vidraçaria' },
  { value: 'ferramentas', label: 'Ferramentas e EPIs' },
  { value: 'madeira', label: 'Madeira e tapumes' },
  { value: 'outros', label: 'Outros materiais' },
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]['value'];

export const MATERIAL_CATEGORY_LABEL = Object.fromEntries(
  MATERIAL_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<string, string>;

export const UNITS = [
  'un',
  'pç',
  'caixa',
  'pacote',
  'kg',
  'Ton',
  'm',
  'm²',
  'm³',
  'm linear',
  'litros',
  'galão',
  'saca',
  'fardo',
  'rolo',
  'balde',
  'milheiro',
] as const;
