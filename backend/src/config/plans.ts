/**
 * Configuração de limites por plano.
 * Fonte única da verdade para enforcement de funcionalidades por tier.
 */
export const PLAN_LIMITS = {
  BASIC: {
    suppliersPerQuote: 5,
    quotesPerMonth: 20,
    priceHistoryDays: 30,
  },
  PRO: {
    suppliersPerQuote: 10,
    quotesPerMonth: 100,
    priceHistoryDays: 365,
  },
  ENTERPRISE: {
    suppliersPerQuote: Infinity,
    quotesPerMonth: Infinity,
    priceHistoryDays: Infinity,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

/**
 * Retorna os limites do plano. Fallback para BASIC se plano desconhecido.
 */
export function getPlanLimits(plan: string) {
  const normalized = plan.toUpperCase() as PlanName;
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.BASIC;
}

/**
 * Retorna o nome do plano de upgrade sugerido.
 */
export function getUpgradePlan(currentPlan: string): string | null {
  const upper = currentPlan.toUpperCase();
  if (upper === 'BASIC') return 'PRO';
  if (upper === 'PRO') return 'ENTERPRISE';
  return null;
}
