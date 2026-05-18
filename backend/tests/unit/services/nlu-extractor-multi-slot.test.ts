import { NLUExtractorService } from '../../../src/services/nlu-extractor.service';
import { openaiService } from '../../../src/services/openai.service';
import { redis } from '../../../src/config/redis';
import { ProductCategoryService } from '../../../src/services/product-category.service';

jest.mock('../../../src/services/openai.service', () => ({
  openaiService: { extractStructuredQuoteFields: jest.fn() },
}));
jest.mock('../../../src/config/redis');
jest.mock('../../../src/services/product-category.service', () => ({
  ProductCategoryService: { infer: jest.fn() },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockOpenAI = openaiService.extractStructuredQuoteFields as jest.Mock;
const mockInfer = ProductCategoryService.infer as jest.Mock;
const mockRedis = redis as unknown as { get: jest.Mock; setex: jest.Mock };

const service = new NLUExtractorService();

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.get = jest.fn().mockResolvedValue(null);
  mockRedis.setex = jest.fn().mockResolvedValue('OK');
  mockInfer.mockResolvedValue(null);
});

describe('NLUExtractorService.extractMultiSlot — caminho OpenAI', () => {
  it('usa resposta estruturada da OpenAI quando disponível', async () => {
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: {
        product: { value: 'SSP 20%', confidence: 0.95 },
        quantity: { value: 60, unit: 'Ton', confidence: 0.93 },
        region: { value: 'Rio Verde', confidence: 0.85, needsDisambiguation: true },
        freight: { value: 'CIF', confidence: 0.95 },
      },
    });

    const result = await service.extractMultiSlot('SSP 20% 60 ton Rio Verde CIF');

    expect(result.source).toBe('openai');
    expect(result.modelVersion).toBe('gpt-4o-2024-08-06');
    expect(result.fields.product?.value).toBe('SSP 20%');
    expect(result.fields.quantity?.value).toBe(60);
    expect(result.fields.region?.needsDisambiguation).toBe(true);
    expect(result.fields.freight?.value).toBe('CIF');
  });

  it('descarta campos com confiança < 0.5', async () => {
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: {
        product: { value: 'SSP 20%', confidence: 0.95 },
        region: { value: 'rv', confidence: 0.3, needsDisambiguation: false }, // baixa
      },
    });

    const result = await service.extractMultiSlot('SSP 20% rv');
    expect(result.fields.product).toBeDefined();
    expect(result.fields.region).toBeUndefined(); // descartado
  });

  it('infere categoria via ProductCategoryService quando não veio da OpenAI', async () => {
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: {
        product: { value: 'Roundup Original', confidence: 0.95 },
      },
    });
    mockInfer.mockResolvedValue('Defensivo');

    const result = await service.extractMultiSlot('Roundup Original');

    expect(mockInfer).toHaveBeenCalledWith('Roundup Original');
    expect(result.fields.category?.value).toBe('Defensivo');
    expect(result.fields.category?.confidence).toBe(0.9);
  });

  it('preserva categoria da OpenAI sem chamar ProductCategoryService', async () => {
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: {
        product: { value: 'Ureia', confidence: 0.95 },
        category: { value: 'Fertilizante', confidence: 0.92 },
      },
    });

    await service.extractMultiSlot('60 ton de ureia');

    expect(mockInfer).not.toHaveBeenCalled();
  });
});

describe('NLUExtractorService.extractMultiSlot — fallback regex', () => {
  it('usa regex quando OpenAI retorna null', async () => {
    mockOpenAI.mockResolvedValue(null);

    const result = await service.extractMultiSlot('60 ton de soja CIF à vista');

    expect(result.source).toBe('regex');
    expect(result.modelVersion).toBe('regex-v1');
    expect(result.fields.quantity?.value).toBe(60);
    expect(result.fields.quantity?.unit).toBe('Ton');
    expect(result.fields.freight?.value).toBe('CIF');
  });

  it('regex retorna confiança 0.7-0.95 conforme campo', async () => {
    mockOpenAI.mockResolvedValue(null);

    const result = await service.extractMultiSlot('100 sacas de milho CIF');

    expect(result.fields.quantity?.confidence).toBe(0.85);
    expect(result.fields.freight?.confidence).toBe(0.95);
  });

  it('extração vazia quando regex não casa nada', async () => {
    mockOpenAI.mockResolvedValue(null);

    const result = await service.extractMultiSlot('oi');

    expect(Object.keys(result.fields)).toHaveLength(0);
    expect(result.source).toBe('regex');
  });
});

describe('NLUExtractorService.extractMultiSlot — cache Redis', () => {
  it('hit no cache retorna resultado com source=cache, sem chamar OpenAI', async () => {
    const cached = {
      fields: { product: { value: 'SSP 20%', confidence: 0.95 } },
      rawMessage: 'SSP 20%',
      extractedAt: new Date().toISOString(),
      modelVersion: 'gpt-4o-2024-08-06',
      source: 'openai',
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.extractMultiSlot('SSP 20%');

    expect(result.source).toBe('cache');
    expect(mockOpenAI).not.toHaveBeenCalled();
  });

  it('miss no cache → chama OpenAI e setex com TTL 30min', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: { product: { value: 'X', confidence: 0.9 } },
    });

    await service.extractMultiSlot('mensagem nova');

    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^nlu_extract:/),
      30 * 60,
      expect.any(String),
    );
  });

  it('falha no Redis NÃO impede extração (fail-open)', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'));
    mockRedis.setex.mockRejectedValue(new Error('redis down'));
    mockOpenAI.mockResolvedValue({
      modelVersion: 'gpt-4o-2024-08-06',
      fields: { product: { value: 'X', confidence: 0.9 } },
    });

    const result = await service.extractMultiSlot('SSP');

    expect(result.fields.product?.value).toBe('X');
  });
});
