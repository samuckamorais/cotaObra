import { PLAN_LIMITS, getPlanLimits, getUpgradePlan } from '../../../src/config/plans';

describe('PLAN_LIMITS', () => {
  it('define limite de 5 fornecedores para BASIC', () => {
    expect(PLAN_LIMITS.BASIC.suppliersPerQuote).toBe(5);
  });

  it('define limite de 10 fornecedores para PRO', () => {
    expect(PLAN_LIMITS.PRO.suppliersPerQuote).toBe(10);
  });

  it('define limite ilimitado para ENTERPRISE', () => {
    expect(PLAN_LIMITS.ENTERPRISE.suppliersPerQuote).toBe(Infinity);
  });

  it('define quotesPerMonth para cada plano', () => {
    expect(PLAN_LIMITS.BASIC.quotesPerMonth).toBe(20);
    expect(PLAN_LIMITS.PRO.quotesPerMonth).toBe(100);
    expect(PLAN_LIMITS.ENTERPRISE.quotesPerMonth).toBe(Infinity);
  });

  it('define priceHistoryDays para cada plano', () => {
    expect(PLAN_LIMITS.BASIC.priceHistoryDays).toBe(30);
    expect(PLAN_LIMITS.PRO.priceHistoryDays).toBe(365);
    expect(PLAN_LIMITS.ENTERPRISE.priceHistoryDays).toBe(Infinity);
  });
});

describe('getPlanLimits', () => {
  it('retorna limites corretos para BASIC', () => {
    const limits = getPlanLimits('BASIC');
    expect(limits.suppliersPerQuote).toBe(5);
  });

  it('retorna limites corretos para PRO', () => {
    const limits = getPlanLimits('PRO');
    expect(limits.suppliersPerQuote).toBe(10);
  });

  it('retorna limites corretos para ENTERPRISE', () => {
    const limits = getPlanLimits('ENTERPRISE');
    expect(limits.suppliersPerQuote).toBe(Infinity);
  });

  it('aceita lowercase e retorna limites corretos', () => {
    expect(getPlanLimits('basic').suppliersPerQuote).toBe(5);
    expect(getPlanLimits('pro').suppliersPerQuote).toBe(10);
    expect(getPlanLimits('enterprise').suppliersPerQuote).toBe(Infinity);
  });

  it('aceita mixed case', () => {
    expect(getPlanLimits('Basic').suppliersPerQuote).toBe(5);
    expect(getPlanLimits('Pro').suppliersPerQuote).toBe(10);
  });

  it('retorna BASIC como fallback para plano desconhecido', () => {
    const limits = getPlanLimits('INEXISTENTE');
    expect(limits.suppliersPerQuote).toBe(5);
    expect(limits.quotesPerMonth).toBe(20);
  });

  it('retorna BASIC como fallback para string vazia', () => {
    const limits = getPlanLimits('');
    expect(limits.suppliersPerQuote).toBe(5);
  });
});

describe('getUpgradePlan', () => {
  it('sugere PRO para quem está no BASIC', () => {
    expect(getUpgradePlan('BASIC')).toBe('PRO');
    expect(getUpgradePlan('basic')).toBe('PRO');
    expect(getUpgradePlan('Basic')).toBe('PRO');
  });

  it('sugere ENTERPRISE para quem está no PRO', () => {
    expect(getUpgradePlan('PRO')).toBe('ENTERPRISE');
    expect(getUpgradePlan('pro')).toBe('ENTERPRISE');
  });

  it('retorna null para ENTERPRISE (não há upgrade)', () => {
    expect(getUpgradePlan('ENTERPRISE')).toBeNull();
    expect(getUpgradePlan('enterprise')).toBeNull();
  });

  it('retorna null para plano desconhecido', () => {
    expect(getUpgradePlan('INEXISTENTE')).toBeNull();
  });
});
