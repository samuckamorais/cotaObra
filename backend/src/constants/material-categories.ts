/**
 * CotaObra — Categorias canônicas de MATERIAIS DE CONSTRUÇÃO.
 *
 * Substitui o catálogo agro (sementes, fertilizantes, etc) do cotaAgro.
 * Lista referência: PLANO_DE_FORK.md §6 e ARQUITETURA §5 (Material).
 *
 * Fonte de verdade para:
 *   - NLU do WhatsApp (resolver "cimento", "areia média" etc → value canônico)
 *   - Cadastro de fornecedor (Supplier.categories[])
 *   - Filtros de busca no frontend
 *
 * XLINKED → ../../../frontend/src/types/supplier.ts (manter sincronizado;
 * unificação em pacote shared está prevista em task futura).
 */
export const MATERIAL_CATEGORIES = [
  { value: 'cimento',           label: 'Cimento e cal' },
  { value: 'agregados',         label: 'Agregados (areia, brita, pedrisco)' },
  { value: 'aco',               label: 'Aço e ferragens' },
  { value: 'blocos',            label: 'Blocos, tijolos e lajotas' },
  { value: 'concreto',          label: 'Concreto usinado e argamassa' },
  { value: 'hidraulica',        label: 'Hidráulica (tubos, conexões, registros)' },
  { value: 'eletrica',          label: 'Elétrica (fios, eletrodutos, quadros)' },
  { value: 'gesso',             label: 'Gesso e drywall' },
  { value: 'revestimento',      label: 'Revestimento cerâmico e porcelanato' },
  { value: 'pintura',           label: 'Tintas e vernizes' },
  { value: 'cobertura',         label: 'Telhas e cobertura' },
  { value: 'esquadrias',        label: 'Esquadrias (portas, janelas)' },
  { value: 'impermeabilizacao', label: 'Impermeabilização' },
  { value: 'vidracaria',        label: 'Vidraçaria' },
  { value: 'ferramentas',       label: 'Ferramentas e EPIs' },
  { value: 'madeira',           label: 'Madeira e tapumes' },
  { value: 'outros',            label: 'Outros materiais' },
] as const;

export const MATERIAL_CATEGORY_LABELS: ReadonlyArray<string> =
  MATERIAL_CATEGORIES.map((c) => c.label);

export const MATERIAL_CATEGORY_VALUES: ReadonlyArray<string> =
  MATERIAL_CATEGORIES.map((c) => c.value);

/**
 * Procura uma categoria canônica pelo label (case-insensitive, tolerante a acentos).
 */
export function findCanonicalCategoryLabel(
  input: string | null | undefined,
): string | undefined {
  if (!input) return undefined;
  const target = input.trim().toLowerCase();
  if (!target) return undefined;
  return MATERIAL_CATEGORIES.find(
    (c) => c.label.toLowerCase() === target,
  )?.label;
}

/** Normaliza string: remove acento, lowercase, trim. */
function normalizeForLookup(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Resolve input livre do usuário em VALUE canônico de material.
 * Aceita variações de case, acento e plural simples. Retorna value
 * canônico (ex: "cimento") ou undefined se não casar.
 */
export function resolveCategoryValue(
  input: string | null | undefined,
): string | undefined {
  if (!input) return undefined;
  const target = normalizeForLookup(input);
  if (!target) return undefined;

  // 1) match por value direto
  let hit = MATERIAL_CATEGORIES.find(
    (c) => normalizeForLookup(c.value) === target,
  );
  if (hit) return hit.value;

  // 2) match por label normalizado
  hit = MATERIAL_CATEGORIES.find(
    (c) => normalizeForLookup(c.label) === target,
  );
  if (hit) return hit.value;

  // 3) tolerância a plural simples (-s final)
  if (target.endsWith('s')) {
    const singular = target.slice(0, -1);
    hit = MATERIAL_CATEGORIES.find(
      (c) =>
        normalizeForLookup(c.value) === singular ||
        normalizeForLookup(c.label) === singular,
    );
    if (hit) return hit.value;
  }

  // 4) sinônimos comuns (mapping curto — expandir conforme tickets)
  const SYNONYMS: Record<string, string> = {
    areia: 'agregados',
    brita: 'agregados',
    pedrisco: 'agregados',
    vergalhao: 'aco',
    ferro: 'aco',
    tijolo: 'blocos',
    lajota: 'blocos',
    drywall: 'gesso',
    porcelanato: 'revestimento',
    ceramica: 'revestimento',
    tinta: 'pintura',
    telha: 'cobertura',
    porta: 'esquadrias',
    janela: 'esquadrias',
    vidro: 'vidracaria',
    epi: 'ferramentas',
    tabua: 'madeira',
    tapume: 'madeira',
  };
  const synonymHit = SYNONYMS[target] ?? SYNONYMS[target.replace(/s$/, '')];
  if (synonymHit) return synonymHit;

  return undefined;
}
