import {
  parseAdvancedEdit,
  applyRemoveSupplier,
  applyTopNSuppliers,
} from '../../../src/services/inline-edit-advanced.service';
import { ConversationContext } from '../../../src/types';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: { supplier: { findMany: jest.fn() } },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const SUPPLIERS = [
  { id: 's1', name: 'Pedro Silva', phone: '+5511111111111' },
  { id: 's2', name: 'Maria Santos', phone: '+5511222222222' },
  { id: 's3', name: 'João Oliveira', phone: '+5511333333333' },
  { id: 's4', name: 'Ana Pereira', phone: '+5511444444444' },
];

const baseCtx = (): ConversationContext => ({
  selectedSuppliers: [...SUPPLIERS],
});

describe('parseAdvancedEdit — top N', () => {
  it.each([
    ['top 3 maiores', 3],
    ['3 maiores', 3],
    ['só meus 3 maiores', 3],
    ['só meu 1 maior', 1],
    ['apenas os 5 maiores', 5],
    ['top 10', 10],
  ])('"%s" → top N (%d)', (input, expected) => {
    const r = parseAdvancedEdit(input);
    expect(r?.kind).toBe('top_n_suppliers');
    if (r?.kind === 'top_n_suppliers') expect(r.n).toBe(expected);
  });

  it('não casa com "0 maiores" ou "200 maiores"', () => {
    expect(parseAdvancedEdit('0 maiores')).toBeNull();
    // 200 também rejeita (max 100)
    expect(parseAdvancedEdit('top 200')).toBeNull();
  });
});

describe('parseAdvancedEdit — remove supplier', () => {
  it.each([
    ['tira o Pedro', ['Pedro']],
    ['remove o Pedro', ['Pedro']],
    ['exclui Pedro', ['Pedro']],
    ['tira a Maria', ['Maria']],
    ['sem Pedro', ['Pedro']],
  ])('"%s" → remove %s', (input, expected) => {
    const r = parseAdvancedEdit(input);
    expect(r?.kind).toBe('remove_supplier');
    if (r?.kind === 'remove_supplier') expect(r.targets).toEqual(expected);
  });

  it('multi-remove: "tira o Pedro e o João" → 2 alvos', () => {
    const r = parseAdvancedEdit('tira o Pedro e o João');
    expect(r?.kind).toBe('remove_supplier');
    if (r?.kind === 'remove_supplier') {
      expect(r.targets).toEqual(['Pedro', 'João']);
    }
  });

  it('multi-remove via vírgula: "remove Pedro, Maria"', () => {
    const r = parseAdvancedEdit('remove Pedro, Maria');
    expect(r?.kind).toBe('remove_supplier');
    if (r?.kind === 'remove_supplier') {
      expect(r.targets.sort()).toEqual(['Maria', 'Pedro']);
    }
  });
});

describe('parseAdvancedEdit — não casa', () => {
  it.each(['sim', 'frete FOB', 'oi', '', '   '])('"%s" → null', (input) => {
    expect(parseAdvancedEdit(input)).toBeNull();
  });
});

describe('applyRemoveSupplier', () => {
  it('remove fornecedor com nome exato', () => {
    const r = applyRemoveSupplier(baseCtx(), ['Pedro Silva']);
    expect(r.removed).toEqual(['Pedro Silva']);
    expect(r.selectedAfter).toHaveLength(3);
    expect(r.selectedAfter.find((s) => s.name === 'Pedro Silva')).toBeUndefined();
  });

  it('remove via fuzzy ("pedro" → "Pedro Silva")', () => {
    const r = applyRemoveSupplier(baseCtx(), ['pedro']);
    expect(r.removed).toEqual(['Pedro Silva']);
  });

  it('múltiplas remoções', () => {
    const r = applyRemoveSupplier(baseCtx(), ['Pedro', 'Maria']);
    expect(r.removed.sort()).toEqual(['Maria Santos', 'Pedro Silva']);
    expect(r.selectedAfter).toHaveLength(2);
  });

  it('marca como notFound quando o nome não tem match', () => {
    const r = applyRemoveSupplier(baseCtx(), ['Carlos']);
    expect(r.removed).toEqual([]);
    expect(r.notFound).toEqual(['Carlos']);
    expect(r.selectedAfter).toHaveLength(4);
  });

  it('contexto sem selectedSuppliers retorna inalterado', () => {
    const r = applyRemoveSupplier({}, ['Pedro']);
    expect(r.removed).toEqual([]);
    expect(r.notFound).toEqual(['Pedro']);
  });
});

describe('applyTopNSuppliers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.supplier.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', name: 'Pedro Silva', phone: '+5511111111111', totalProposals: 50, acceptedProposals: 30 },
      { id: 's2', name: 'Maria Santos', phone: '+5511222222222', totalProposals: 40, acceptedProposals: 25 },
      { id: 's3', name: 'João Oliveira', phone: '+5511333333333', totalProposals: 30, acceptedProposals: 20 },
      { id: 's4', name: 'Ana Pereira', phone: '+5511444444444', totalProposals: 10, acceptedProposals: 5 },
    ]);
  });

  it('top 2 mantém apenas os 2 com maior totalProposals', async () => {
    const r = await applyTopNSuppliers(baseCtx(), 2);
    expect(r.selectedAfter.map((s) => s.name).sort()).toEqual(['Maria Santos', 'Pedro Silva']);
    expect(r.removed.sort()).toEqual(['Ana Pereira', 'João Oliveira']);
  });

  it('top 5 (>= total) retorna lista inalterada', async () => {
    const r = await applyTopNSuppliers(baseCtx(), 5);
    expect(r.selectedAfter).toHaveLength(4);
    expect(r.removed).toEqual([]);
  });

  it('top 0 retorna inalterado', async () => {
    const r = await applyTopNSuppliers(baseCtx(), 0);
    expect(r.removed).toEqual([]);
  });

  it('contexto sem selectedSuppliers retorna inalterado', async () => {
    const r = await applyTopNSuppliers({}, 3);
    expect(r.removed).toEqual([]);
  });

  it('falha de banco devolve contexto original', async () => {
    (prisma.supplier.findMany as jest.Mock).mockRejectedValue(new Error('db down'));
    const r = await applyTopNSuppliers(baseCtx(), 2);
    expect(r.selectedAfter).toHaveLength(4);
    expect(r.removed).toEqual([]);
  });
});
