import { SemanticValidator } from '../../../src/services/semantic-validator.service';
import { NLUExtraction } from '../../../src/services/nlu-types';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const NOW = new Date('2026-05-08T12:00:00');

function makeExtraction(fields: Partial<NLUExtraction['fields']>): NLUExtraction {
  return {
    fields,
    rawMessage: '',
    extractedAt: new Date(),
    modelVersion: 'test',
    source: 'openai',
  };
}

describe('SemanticValidator — quantity vs categoria', () => {
  it('Fertilizante 60 Ton → ok (sem issue)', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        category: { value: 'Fertilizante', confidence: 0.95 },
        quantity: { value: 60, unit: 'Ton', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('Fertilizante 60.000 Ton → warn (acima do max 10.000)', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        category: { value: 'Fertilizante', confidence: 0.95 },
        quantity: { value: 60_000, unit: 'Ton', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('warn');
    expect(result.issues[0].reason).toBe('qty_above_max');
  });

  it('Fertilizante 0.1 Ton → error (abaixo do min 0.5)', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        category: { value: 'Fertilizante', confidence: 0.95 },
        quantity: { value: 0.1, unit: 'Ton', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].reason).toBe('qty_below_min');
  });

  it('categoria desconhecida não gera issue de quantidade', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        category: { value: 'Coisa nova', confidence: 0.95 },
        quantity: { value: 60_000, unit: 'Ton', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues.filter((i) => i.field === 'quantity')).toHaveLength(0);
  });
});

describe('SemanticValidator — deadline', () => {
  it('ISO no futuro → ok', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: '2026-08-30', confidence: 0.95 } }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('ISO no passado → error', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: '2025-08-30', confidence: 0.95 } }),
      { now: NOW },
    );
    expect(result.issues[0].reason).toBe('date_in_past');
  });

  it('30/02/2026 → date_invalid', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: '30/02/2026', confidence: 0.95 } }),
      { now: NOW },
    );
    expect(result.issues[0].reason).toBe('date_invalid');
  });

  it('amanhã → ok (1 dia no futuro)', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: 'amanhã', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('em 5 dias → ok', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: 'em 5 dias', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('formato dd/mm sem ano → assume ano corrente', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ deadline: { value: '30/12', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });
});

describe('SemanticValidator — região (IBGE)', () => {
  it('"Rio Verde" existe na base IBGE → sem issue', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ region: { value: 'Rio Verde', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues.filter((i) => i.field === 'region')).toHaveLength(0);
  });

  it('"Cidade Inexistente XYZ" → warn region_unknown', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ region: { value: 'Cidade Inexistente XYZ', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues[0].reason).toBe('region_unknown');
    expect(result.issues[0].severity).toBe('warn');
  });

  it('case-insensitive e sem acento — "rio verde" casa', () => {
    const result = SemanticValidator.validate(
      makeExtraction({ region: { value: 'rio verde', confidence: 0.85 } }),
      { now: NOW },
    );
    expect(result.issues.filter((i) => i.field === 'region')).toHaveLength(0);
  });
});

describe('SemanticValidator — produto vs categoria', () => {
  it('soja como Semente → ok', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        product: { value: 'soja BMX', confidence: 0.95 },
        category: { value: 'Semente', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('soja como Combustível → warn product_category_mismatch', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        product: { value: 'soja', confidence: 0.95 },
        category: { value: 'Combustível', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues[0].reason).toBe('product_category_mismatch');
    expect(result.issues[0].severity).toBe('warn');
  });

  it('Roundup como Defensivo → ok', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        product: { value: 'Roundup', confidence: 0.95 },
        category: { value: 'Defensivo', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues).toHaveLength(0);
  });

  it('Diesel como Fertilizante → warn', () => {
    const result = SemanticValidator.validate(
      makeExtraction({
        product: { value: 'Diesel S10', confidence: 0.95 },
        category: { value: 'Fertilizante', confidence: 0.95 },
      }),
      { now: NOW },
    );
    expect(result.issues[0].reason).toBe('product_category_mismatch');
  });
});

describe('SemanticValidator — extração vazia', () => {
  it('nenhum campo → nenhuma issue', () => {
    const result = SemanticValidator.validate(makeExtraction({}), { now: NOW });
    expect(result.issues).toHaveLength(0);
  });
});
