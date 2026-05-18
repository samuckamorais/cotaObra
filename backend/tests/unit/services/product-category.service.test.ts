import { ProductCategoryService } from '../../../src/services/product-category.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    productCategoryMapping: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindMany = prisma.productCategoryMapping.findMany as unknown as jest.Mock;
const mockCreate = prisma.productCategoryMapping.create as unknown as jest.Mock;

const SEED = [
  { id: '1', keyword: 'ssp', category: 'Fertilizante' },
  { id: '2', keyword: 'ureia', category: 'Fertilizante' },
  { id: '3', keyword: 'glifosato', category: 'Defensivo' },
  { id: '4', keyword: 'roundup', category: 'Defensivo' },
  { id: '5', keyword: 'soja', category: 'Semente' },
  { id: '6', keyword: 'torta de soja', category: 'Ração' },
  { id: '7', keyword: 'diesel', category: 'Combustível' },
  { id: '8', keyword: 'foliar', category: 'Foliar' },
];

beforeEach(() => {
  jest.clearAllMocks();
  ProductCategoryService._clearCache();
  mockFindMany.mockResolvedValue(SEED);
});

describe('ProductCategoryService.infer', () => {
  it.each([
    ['SSP 20%', 'Fertilizante'],
    ['ureia perolada', 'Fertilizante'],
    ['Roundup Original', 'Defensivo'],
    ['glifosato 480', 'Defensivo'],
    ['soja BMX', 'Semente'],
    ['Diesel S10', 'Combustível'],
    ['fertilizante foliar boro', 'Foliar'], // foliar é mais específico que nada — falta keyword
  ])('"%s" → "%s"', async (input, expected) => {
    const result = await ProductCategoryService.infer(input);
    expect(result).toBe(expected);
  });

  it('"torta de soja" prefere keyword mais longa (Ração) sobre "soja" (Semente)', async () => {
    const result = await ProductCategoryService.infer('torta de soja prensada');
    expect(result).toBe('Ração');
  });

  it('produto desconhecido retorna null', async () => {
    const result = await ProductCategoryService.infer('Fitossanitário XYZ 2000');
    expect(result).toBeNull();
  });

  it('texto vazio retorna null', async () => {
    expect(await ProductCategoryService.infer('')).toBeNull();
    expect(await ProductCategoryService.infer('   ')).toBeNull();
  });

  it('case-insensitive e tolerante a acentos', async () => {
    expect(await ProductCategoryService.infer('SSP')).toBe('Fertilizante');
    expect(await ProductCategoryService.infer('ssp')).toBe('Fertilizante');
    expect(await ProductCategoryService.infer('SsP')).toBe('Fertilizante');
  });

  it('respeita word boundary — "sojabean" não casa com "soja"', async () => {
    const result = await ProductCategoryService.infer('sojabean blend');
    expect(result).toBeNull();
  });

  it('cache: segunda chamada não bate no findMany', async () => {
    await ProductCategoryService.infer('SSP');
    await ProductCategoryService.infer('Roundup');
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it('lista vazia → null', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await ProductCategoryService.infer('SSP');
    expect(result).toBeNull();
  });
});

describe('ProductCategoryService.create', () => {
  it('normaliza keyword (lower + sem acentos) e categoria (Capitalize)', async () => {
    mockCreate.mockResolvedValue({ id: 'x', keyword: 'calcario', category: 'Fertilizante' });

    await ProductCategoryService.create('Calcário', 'fertilizante');

    expect(mockCreate).toHaveBeenCalledWith({
      data: { keyword: 'calcario', category: 'Fertilizante' },
      select: expect.any(Object),
    });
  });

  it('rejeita keyword muito curta', async () => {
    await expect(ProductCategoryService.create('a', 'Fertilizante')).rejects.toThrow();
  });

  it('rejeita categoria vazia', async () => {
    await expect(ProductCategoryService.create('ureia', '')).rejects.toThrow();
  });

  it('invalida cache após create', async () => {
    // popula cache
    await ProductCategoryService.list();
    expect(mockFindMany).toHaveBeenCalledTimes(1);

    mockCreate.mockResolvedValue({ id: 'x', keyword: 'novo', category: 'Fertilizante' });
    await ProductCategoryService.create('novo', 'Fertilizante');

    // próxima leitura deve refazer findMany
    await ProductCategoryService.list();
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });
});
