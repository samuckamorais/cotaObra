import { SmartDefaultsService } from '../../../src/services/smart-defaults.service';
import { ConversationContext } from '../../../src/types';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: { producer: { findUnique: jest.fn() } },
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockFindProducer = prisma.producer.findUnique as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SmartDefaultsService.loadFor', () => {
  it('retorna prefs quando producer.lastQuotePreferences existe', async () => {
    mockFindProducer.mockResolvedValue({
      lastQuotePreferences: { freight: 'CIF', paymentTerms: 'à vista' },
    });
    const result = await SmartDefaultsService.loadFor('p1');
    expect(result).toEqual({ freight: 'CIF', paymentTerms: 'à vista' });
  });

  it('retorna null quando producer não existe', async () => {
    mockFindProducer.mockResolvedValue(null);
    expect(await SmartDefaultsService.loadFor('p1')).toBeNull();
  });

  it('retorna null quando lastQuotePreferences é null', async () => {
    mockFindProducer.mockResolvedValue({ lastQuotePreferences: null });
    expect(await SmartDefaultsService.loadFor('p1')).toBeNull();
  });

  it('fail-open em erro de banco', async () => {
    mockFindProducer.mockRejectedValue(new Error('connection lost'));
    expect(await SmartDefaultsService.loadFor('p1')).toBeNull();
  });
});

describe('SmartDefaultsService.apply', () => {
  it('preenche freight quando ausente no contexto', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, { freight: 'CIF' });
    expect(context.freight).toBe('CIF');
    expect(defaulted).toEqual(['freight']);
  });

  it('preenche paymentTerms (mapeia para quotePaymentTerms)', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, { paymentTerms: 'à vista' });
    expect(context.quotePaymentTerms).toBe('à vista');
    expect(defaulted).toEqual(['paymentTerms']);
  });

  it('preenche region quando ausente', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, { region: 'Rio Verde' });
    expect(context.region).toBe('Rio Verde');
    expect(defaulted).toEqual(['region']);
  });

  it('NÃO sobrescreve campo já preenchido (RN-01)', () => {
    const ctx: ConversationContext = { freight: 'FOB' };
    const { context, defaulted } = SmartDefaultsService.apply(ctx, { freight: 'CIF' });
    expect(context.freight).toBe('FOB');
    expect(defaulted).toEqual([]);
  });

  it('aplica múltiplos defaults em uma chamada', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, {
      freight: 'CIF',
      paymentTerms: '30 dias',
      region: 'Sorriso',
    });
    expect(context.freight).toBe('CIF');
    expect(context.quotePaymentTerms).toBe('30 dias');
    expect(context.region).toBe('Sorriso');
    expect(defaulted.sort()).toEqual(['freight', 'paymentTerms', 'region'].sort());
  });

  it('NÃO aplica deadline (não é defaultable)', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, {
      deadline: '2026-08-30',
    } as any);
    expect(context.deadline).toBeUndefined();
    expect(defaulted).toEqual([]);
  });

  it('prefs null → não toca no contexto', () => {
    const ctx: ConversationContext = { freight: 'FOB' };
    const { context, defaulted } = SmartDefaultsService.apply(ctx, null);
    expect(context).toBe(ctx);
    expect(defaulted).toEqual([]);
  });

  it('freight inválido (nem CIF nem FOB) é ignorado', () => {
    const ctx: ConversationContext = {};
    const { context, defaulted } = SmartDefaultsService.apply(ctx, { freight: 'XYZ' as any });
    expect(context.freight).toBeUndefined();
    expect(defaulted).toEqual([]);
  });
});
