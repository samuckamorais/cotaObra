import {
  SmartFillService,
  RE_CONFIRM,
  RE_CORRECT_ALL,
  RE_VIEW_SUPPLIERS,
} from '../../../src/services/smart-fill.service';
import { NLUExtraction } from '../../../src/services/nlu-types';
import { ValidatedExtraction } from '../../../src/services/semantic-validator.service';

function makeExtraction(fields: Partial<NLUExtraction['fields']>, source: 'openai' | 'regex' = 'openai'): NLUExtraction {
  return { fields, rawMessage: '', extractedAt: new Date(), modelVersion: 'test', source };
}

function wrap(extraction: NLUExtraction, issues: ValidatedExtraction['issues'] = []): ValidatedExtraction {
  return { extraction, issues };
}

describe('SmartFillService.shouldActivate', () => {
  it('ativa quando tem 2+ campos com pelo menos um core (product/quantity/region)', () => {
    const e = makeExtraction({
      product: { value: 'SSP', confidence: 0.9 },
      freight: { value: 'CIF', confidence: 0.95 },
    });
    expect(SmartFillService.shouldActivate(wrap(e))).toBe(true);
  });

  it('NÃO ativa com 1 campo só', () => {
    const e = makeExtraction({ product: { value: 'SSP', confidence: 0.9 } });
    expect(SmartFillService.shouldActivate(wrap(e))).toBe(false);
  });

  it('NÃO ativa com 2+ campos sem core (só freight + payment)', () => {
    const e = makeExtraction({
      freight: { value: 'CIF', confidence: 0.95 },
      payment: { value: 'à vista', confidence: 0.9 },
    });
    expect(SmartFillService.shouldActivate(wrap(e))).toBe(false);
  });
});

describe('SmartFillService.buildContext', () => {
  it('mapeia campos NLU para ConversationContext', () => {
    const e = makeExtraction({
      product: { value: 'SSP 20%', confidence: 0.95 },
      quantity: { value: 60, unit: 'Ton', confidence: 0.9 },
      region: { value: 'Rio Verde', confidence: 0.85 },
      deadline: { value: '30/08', confidence: 0.85 },
      freight: { value: 'CIF', confidence: 0.95 },
      payment: { value: 'à vista', confidence: 0.85 },
      category: { value: 'Fertilizante', confidence: 0.92 },
    });
    const state = SmartFillService.buildContext(wrap(e));

    expect(state.context.items).toEqual([{ product: 'SSP 20%', quantity: 60, unit: 'Ton' }]);
    expect(state.context.region).toBe('Rio Verde');
    expect(state.context.deadline).toBe('30/08');
    expect(state.context.freight).toBe('CIF');
    expect(state.context.quotePaymentTerms).toBe('à vista');
    expect(state.context.category).toBe('Fertilizante');
    expect(state.missing).toHaveLength(0);
  });

  it('listas missing quando faltam campos obrigatórios', () => {
    const e = makeExtraction({ product: { value: 'SSP', confidence: 0.95 } });
    const state = SmartFillService.buildContext(wrap(e));
    expect(state.missing).toEqual(expect.arrayContaining(['quantity', 'region', 'deadline', 'freight', 'payment']));
  });

  it('descarta campo com issue severity=error', () => {
    const e = makeExtraction({
      product: { value: 'SSP', confidence: 0.95 },
      deadline: { value: '30/02/2026', confidence: 0.9 },
    });
    const state = SmartFillService.buildContext(
      wrap(e, [{ field: 'deadline', reason: 'date_invalid', severity: 'error', message: 'inválida' }]),
    );
    expect(state.context.deadline).toBeUndefined();
    expect(state.missing).toContain('deadline');
  });

  it('preserva campo com issue severity=warn', () => {
    const e = makeExtraction({
      product: { value: 'SSP', confidence: 0.95 },
      quantity: { value: 60_000, unit: 'Ton', confidence: 0.9 },
      category: { value: 'Fertilizante', confidence: 0.92 },
    });
    const state = SmartFillService.buildContext(
      wrap(e, [{ field: 'quantity', reason: 'qty_above_max', severity: 'warn', message: 'muito alta' }]),
    );
    expect(state.context.items?.[0].quantity).toBe(60_000);
    expect(state.warnings).toHaveLength(1);
  });
});

describe('SmartFillService.buildSummary', () => {
  it('renderiza linhas estruturadas com bullets WhatsApp', () => {
    const e = makeExtraction({
      product: { value: 'SSP 20%', confidence: 0.95 },
      quantity: { value: 60, unit: 'Ton', confidence: 0.9 },
      region: { value: 'Rio Verde', confidence: 0.85 },
      deadline: { value: '30/08', confidence: 0.85 },
      freight: { value: 'CIF', confidence: 0.95 },
      payment: { value: 'à vista', confidence: 0.85 },
      category: { value: 'Fertilizante', confidence: 0.92 },
    });
    const state = SmartFillService.buildContext(wrap(e));
    const msg = SmartFillService.buildSummary(state, 8);

    expect(msg).toContain('✅ SSP 20% • 60 Ton • Fertilizante');
    expect(msg).toContain('📍 Rio Verde • prazo 30/08');
    expect(msg).toContain('🚚 CIF • à vista');
    expect(msg).toContain('👥 8 fornecedores');
    expect(msg).toContain('Confirma?');
  });

  it('inclui warnings com ⚠️ quando issues do validator', () => {
    const e = makeExtraction({
      product: { value: 'SSP', confidence: 0.95 },
      quantity: { value: 60_000, unit: 'Ton', confidence: 0.9 },
      region: { value: 'Rio Verde', confidence: 0.85 },
      deadline: { value: '30/08', confidence: 0.85 },
      freight: { value: 'CIF', confidence: 0.95 },
      payment: { value: 'à vista', confidence: 0.85 },
      category: { value: 'Fertilizante', confidence: 0.92 },
    });
    const state = SmartFillService.buildContext(
      wrap(e, [{ field: 'quantity', reason: 'qty_above_max', severity: 'warn', message: 'Quantidade muito alta — confirma?' }]),
    );
    const msg = SmartFillService.buildSummary(state);
    expect(msg).toContain('⚠️ Quantidade muito alta — confirma?');
  });
});

describe('SmartFillService.buildContext — bugfix de merge', () => {
  it('preserva quantity existente quando nova mensagem traz só produto', () => {
    const baseCtx = {
      items: [{ product: '', quantity: 10, unit: 'Big Bags' }],
      region: 'Jataí - GO',
    };
    const e = makeExtraction({ product: { value: '73i75', confidence: 0.9 } });
    const state = SmartFillService.buildContext(wrap(e), baseCtx);

    expect(state.context.items?.[0]).toEqual({
      product: '73i75',
      quantity: 10,
      unit: 'Big Bags',
    });
  });

  it('preserva product existente quando nova mensagem traz só quantity', () => {
    const baseCtx = {
      items: [{ product: 'SSP 20%', quantity: 0, unit: 'sacas' }],
    };
    const e = makeExtraction({
      quantity: { value: 60, unit: 'Ton', confidence: 0.95 },
    });
    const state = SmartFillService.buildContext(wrap(e), baseCtx);

    expect(state.context.items?.[0]).toEqual({
      product: 'SSP 20%',
      quantity: 60,
      unit: 'Ton',
    });
  });

  it('quando NLU classifica "Semente" como produto, reinterpreta como categoria', () => {
    const e = makeExtraction({
      product: { value: 'Semente', confidence: 0.8 },
    });
    const state = SmartFillService.buildContext(wrap(e));

    expect(state.context.category).toBe('Semente');
    // Produto NÃO foi setado — sistema deve continuar pedindo
    expect(state.context.items?.[0]?.product ?? '').toBe('');
  });

  it('preserva categoria já existente em vez de re-classificar produto canônico', () => {
    const baseCtx = { category: 'Fertilizante' };
    const e = makeExtraction({
      product: { value: 'Semente', confidence: 0.8 },
    });
    const state = SmartFillService.buildContext(wrap(e), baseCtx);

    // categoria existente é preservada — produto vai pra slot mesmo
    // assim porque não há ambiguidade de categoria
    expect(state.context.category).toBe('Fertilizante');
    expect(state.context.items?.[0]?.product).toBe('Semente');
  });

  it('quando product e categoria estão vazios, missing inclui category (não product)', () => {
    const e = makeExtraction({
      quantity: { value: 10, unit: 'Big Bags', confidence: 0.95 },
      region: { value: 'Jataí - GO', confidence: 0.9 },
    });
    const state = SmartFillService.buildContext(wrap(e));

    expect(state.missing).toContain('category');
    expect(state.missing).not.toContain('product');
  });

  it('quando categoria está setada mas produto não, missing inclui product', () => {
    const e = makeExtraction({
      quantity: { value: 10, unit: 'Big Bags', confidence: 0.95 },
      category: { value: 'Semente', confidence: 0.95 },
      region: { value: 'Jataí - GO', confidence: 0.9 },
    });
    const state = SmartFillService.buildContext(wrap(e));

    expect(state.missing).toContain('product');
    expect(state.missing).not.toContain('category');
  });
});

describe('SmartFillService.buildGroupedQuestion — campo único', () => {
  it('1 campo (category) usa exemplo focado de categorias', () => {
    const msg = SmartFillService.buildGroupedQuestion(['category']);
    expect(msg).toContain('categoria');
    expect(msg).toContain('Semente');
  });

  it('1 campo (product) usa exemplo focado de produtos', () => {
    const msg = SmartFillService.buildGroupedQuestion(['product']);
    expect(msg).toContain('produto');
    expect(msg).toContain('BMX');
  });
});

describe('SmartFillService.buildGroupedQuestion', () => {
  it('usa template top-10 para combinação conhecida', () => {
    const msg = SmartFillService.buildGroupedQuestion(['quantity', 'region', 'deadline']);
    expect(msg).toContain('60 ton, Rio Verde, 30/08');
    expect(msg).toContain('quantidade');
    expect(msg).toContain('região');
    expect(msg).toContain('prazo');
  });

  it('cai no fallback genérico para combinação não-mapeada (multi-campo)', () => {
    const msg = SmartFillService.buildGroupedQuestion(['payment', 'category']);
    expect(msg).toContain('manda os dados que faltam');
  });
});

describe('Vocabulário regex', () => {
  it.each(['sim', 'ok', 'confirmo', 'pode mandar', 'manda', 'envia', 'fechar', 'beleza', 'blz', 'aceito', 'tá', 'TA'])(
    'RE_CONFIRM aceita "%s"',
    (s) => {
      expect(RE_CONFIRM.test(s)).toBe(true);
    },
  );

  it.each(['corrigir tudo', 'recomeçar', 'do zero', 'reset', 'refazer', 'tudo de novo'])(
    'RE_CORRECT_ALL aceita "%s"',
    (s) => {
      expect(RE_CORRECT_ALL.test(s)).toBe(true);
    },
  );

  it.each(['fornecedores', 'lista', 'quais', 'ver fornecedores', 'mostra'])(
    'RE_VIEW_SUPPLIERS aceita "%s"',
    (s) => {
      expect(RE_VIEW_SUPPLIERS.test(s)).toBe(true);
    },
  );

  it('RE_CONFIRM rejeita texto livre', () => {
    expect(RE_CONFIRM.test('quero cotar SSP 20%')).toBe(false);
    expect(RE_CONFIRM.test('frete FOB')).toBe(false);
  });
});
