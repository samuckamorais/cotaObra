import { findCanonicalCategoryLabel } from '../constants/supplier-categories';

/**
 * Normaliza nome de categoria para exibição e armazenamento.
 *
 * Estratégia em duas etapas:
 *   1. Tenta casar com uma categoria canônica do cadastro de fornecedor
 *      (case-insensitive). Se casar, usa a label exata canônica — preserva
 *      capitalização correta de termos compostos (ex: "Insumos em Geral").
 *   2. Caso contrário, aplica regra simples: trim + primeira maiúscula +
 *      restante minúsculas. Para categorias livres digitadas pelo produtor
 *      ("biológicos" → "Biológicos") garante consistência mínima.
 *
 * Idempotente.
 */
export function normalizeCategoryName(category: string | null | undefined): string {
  const trimmed = (category ?? '').trim();
  if (!trimmed) return trimmed;

  const canonical = findCanonicalCategoryLabel(trimmed);
  if (canonical) return canonical;

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
