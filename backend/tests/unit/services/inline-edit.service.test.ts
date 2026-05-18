import { parseInlineEdit } from '../../../src/services/inline-edit.service';
import { ConversationContext } from '../../../src/types';

const BASE: ConversationContext = {
  items: [{ product: 'SSP 20%', quantity: 60, unit: 'Ton' }],
  region: 'Rio Verde',
  deadline: '30/08',
  freight: 'CIF',
  quotePaymentTerms: 'à vista',
  category: 'Fertilizante',
};

describe('parseInlineEdit — frete', () => {
  it.each(['frete FOB', 'FRETE fob', 'trocar frete pra CIF', 'CIF', 'fob'])(
    '"%s" detecta freight',
    (input) => {
      const edit = parseInlineEdit(input);
      expect(edit?.field).toBe('freight');
    },
  );

  it('aplica troca de freight mantendo resto', () => {
    const edit = parseInlineEdit('frete FOB');
    const updated = edit!.apply(BASE);
    expect(updated.freight).toBe('FOB');
    expect(updated.region).toBe('Rio Verde');
    expect(updated.items?.[0].product).toBe('SSP 20%');
  });
});

describe('parseInlineEdit — pagamento', () => {
  it('"pagamento 30 dias" detecta payment', () => {
    const edit = parseInlineEdit('pagamento 30 dias');
    expect(edit?.field).toBe('payment');
    const updated = edit!.apply(BASE);
    expect(updated.quotePaymentTerms).toBe('30 dias');
  });

  it('"trocar pagamento pra safra" detecta', () => {
    const edit = parseInlineEdit('trocar pagamento pra safra');
    expect(edit?.field).toBe('payment');
    expect(edit!.apply(BASE).quotePaymentTerms).toBe('safra');
  });
});

describe('parseInlineEdit — quantidade', () => {
  it.each([
    ['80 ton', 80, 'Ton'],
    ['100 sacas', 100, 'sacas'],
    ['trocar pra 50 kg', 50, 'kg'],
    ['qtd 200 litros', 200, 'litros'],
    ['quantidade 10 bag', 10, 'Big Bags'],
  ])('"%s" detecta quantity %s %s', (input, expectedValue, expectedUnit) => {
    const edit = parseInlineEdit(input);
    expect(edit?.field).toBe('quantity');
    const updated = edit!.apply(BASE);
    expect(updated.items?.[0].quantity).toBe(expectedValue);
    expect(updated.items?.[0].unit).toBe(expectedUnit);
    // Produto preservado
    expect(updated.items?.[0].product).toBe('SSP 20%');
  });

  it('quantidade negativa ou zero não casa', () => {
    expect(parseInlineEdit('0 ton')).toBeNull();
  });
});

describe('parseInlineEdit — região', () => {
  it('"região Sorriso/MT" detecta', () => {
    const edit = parseInlineEdit('região Sorriso/MT');
    expect(edit?.field).toBe('region');
    expect(edit!.apply(BASE).region).toBe('Sorriso/MT');
  });

  it('"cidade Goiânia" detecta', () => {
    const edit = parseInlineEdit('cidade Goiânia');
    expect(edit?.field).toBe('region');
    expect(edit!.apply(BASE).region).toBe('Goiânia');
  });
});

describe('parseInlineEdit — prazo', () => {
  it('"prazo 15/09" detecta', () => {
    const edit = parseInlineEdit('prazo 15/09');
    expect(edit?.field).toBe('deadline');
    expect(edit!.apply(BASE).deadline).toBe('15/09');
  });

  it('"trocar prazo pra 30/12/2026" detecta', () => {
    const edit = parseInlineEdit('trocar prazo pra 30/12/2026');
    expect(edit?.field).toBe('deadline');
    expect(edit!.apply(BASE).deadline).toBe('30/12/2026');
  });
});

describe('parseInlineEdit — produto', () => {
  it('"produto Soja BMX" detecta', () => {
    const edit = parseInlineEdit('produto Soja BMX');
    expect(edit?.field).toBe('product');
    const updated = edit!.apply(BASE);
    expect(updated.items?.[0].product).toBe('Soja BMX');
    // Quantidade preservada
    expect(updated.items?.[0].quantity).toBe(60);
  });
});

describe('parseInlineEdit — não-edits', () => {
  it.each([
    'sim',
    'corrigir tudo',
    'fornecedores',
    'oi',
    'quero cotar SSP 20% 60 ton',
  ])('"%s" retorna null', (input) => {
    expect(parseInlineEdit(input)).toBeNull();
  });

  it('string vazia retorna null', () => {
    expect(parseInlineEdit('')).toBeNull();
    expect(parseInlineEdit('   ')).toBeNull();
  });
});

describe('parseInlineEdit — context vazio', () => {
  it('cria items quando contexto sem items recebe quantity', () => {
    const edit = parseInlineEdit('80 ton');
    const updated = edit!.apply({});
    expect(updated.items).toEqual([
      { product: '', quantity: 80, unit: 'Ton' },
    ]);
  });

  it('cria items quando contexto sem items recebe product', () => {
    const edit = parseInlineEdit('produto Roundup');
    const updated = edit!.apply({});
    expect(updated.items).toEqual([
      { product: 'Roundup', quantity: 0, unit: 'sacas' },
    ]);
  });
});
