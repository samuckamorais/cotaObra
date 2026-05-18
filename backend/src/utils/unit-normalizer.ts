/**
 * CotaObra — Normalizador de unidades de medida.
 *
 * Para materiais de construção, as unidades canônicas mais comuns são:
 *   - massa:        kg, t (Ton)
 *   - volume:       m3, l (litros)
 *   - dimensional:  m, m2, ml (metro linear)
 *   - contagem:     un, pc, cx, pct
 *   - embalagem:    saca (50kg cimento), fardo, rolo, balde, gal
 *   - tempo:        h, dia (apenas para serviço — fora MVP)
 *
 * Mantém também as unidades legadas (Big Bags, hectares) caso algum
 * tenant migrado do cotaAgro ainda use.
 */

/** Conjunto canônico de unidades aceitas no MVP de construção. */
export const UNITS = [
  // Contagem
  'un', 'pc', 'cx', 'pct',
  // Massa
  'kg', 't',
  // Volume / dimensional
  'm', 'm2', 'm3', 'ml', 'l', 'gal',
  // Embalagem específica
  'saca', 'fardo', 'rolo', 'balde', 'milheiro',
  // Tempo (serviços — fora MVP, reservado)
  'h', 'dia',
] as const;

export type Unit = (typeof UNITS)[number];

/**
 * Normaliza unidade digitada pelo usuário para o rótulo canônico
 * exibido nas mensagens.
 *
 * Para unidades não reconhecidas, preserva exatamente o que foi
 * digitado (sem mexer em casing) — princípio: "use a unidade que
 * o usuário informou".
 */
export function normalizeUnit(input: string | undefined | null): string {
  if (!input) return 'unidades';
  const raw = input.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!raw) return 'unidades';

  // ----- Construção: massa -----
  if (/^(kg|kgs|quilo|quilos)$/.test(raw)) return 'kg';
  if (/^(t|ton|tonelada|toneladas)$/.test(raw)) return 'Ton';

  // ----- Construção: volume / dimensional -----
  if (/^(m|metro|metros)$/.test(raw)) return 'm';
  if (/^(m2|metro\s*quadrado|metros\s*quadrados|m²)$/.test(raw)) return 'm²';
  if (/^(m3|metro\s*cubico|metros\s*cubicos|metro\s*cúbico|metros\s*cúbicos|m³)$/.test(raw)) return 'm³';
  if (/^(ml|metro\s*linear|metros\s*lineares)$/.test(raw)) return 'm linear';
  if (/^(l|lt|lts|litro|litros)$/.test(raw)) return 'litros';
  if (/^(gal|galão|galao|galões|galoes)$/.test(raw)) return 'galão';

  // ----- Construção: contagem / embalagem -----
  if (/^(un|unidade|unidades)$/.test(raw)) return 'un';
  if (/^(pc|peca|peças|peca|peças|peça)$/.test(raw)) return 'pç';
  if (/^(cx|caixa|caixas)$/.test(raw)) return 'caixa';
  if (/^(pct|pacote|pacotes)$/.test(raw)) return 'pacote';
  if (/^(saca|sacas|saco|sacos|sc)$/.test(raw)) return 'saca';
  if (/^(fardo|fardos)$/.test(raw)) return 'fardo';
  if (/^(rolo|rolos)$/.test(raw)) return 'rolo';
  if (/^(balde|baldes)$/.test(raw)) return 'balde';
  if (/^(milheiro|milheiros|milh|1000un)$/.test(raw)) return 'milheiro';

  // ----- Serviços (reservado, fora MVP) -----
  if (/^(h|hora|horas)$/.test(raw)) return 'h';
  if (/^(dia|dias)$/.test(raw)) return 'dia';

  // ----- LEGACY agro: mantidos para compatibilidade com tenants antigos -----
  if (/^(big\s*bags?|bags?)$/.test(raw)) return 'Big Bags';
  if (/^(km|kms|quilometro|quilometros|quilômetro|quilômetros)$/.test(raw)) return 'km';
  if (/^(ha|hectare|hectares)$/.test(raw)) return 'ha';

  return input.trim();
}
