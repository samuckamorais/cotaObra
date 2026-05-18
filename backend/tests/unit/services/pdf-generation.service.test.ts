/**
 * FEAT-PDF-001 — PdfGenerationService
 *
 * Foco do teste:
 *  - buildFilename segue convenção da AC-04 (cotacao_<id8>_<YYYY-MM-DD>.pdf)
 *  - generateQuoteResultPdf retorna Buffer não-vazio e filename correto
 *    quando a cotação existe (mocka QuoteResultsService + producer)
 *  - propaga erro quando QuoteResultsService lança
 *
 * O conteúdo visual do PDF não é validado por unit test — verificação
 * é manual via §14.6 da spec (8 passos em staging).
 */
jest.mock('../../../src/config/database', () => ({
  prisma: {
    producer: { findFirst: jest.fn() },
  },
}));

jest.mock('../../../src/services/quote-results.service', () => ({
  QuoteResultsService: { getResults: jest.fn() },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { PdfGenerationService } from '../../../src/services/pdf-generation.service';
import { QuoteResultsService } from '../../../src/services/quote-results.service';
import { prisma } from '../../../src/config/database';

const mockGetResults = QuoteResultsService.getResults as jest.Mock;
const mockFindProducer = prisma.producer.findFirst as jest.Mock;

const baseQuoteData = {
  quoteId: 'abc12345-uuid-rest-irrelevant',
  status: 'CLOSED',
  category: 'defensivo',
  region: 'Rio Verde-GO',
  deadline: new Date('2026-06-01T00:00:00Z'),
  freight: 'CIF',
  producerName: 'João Silva',
  items: [
    { id: 'i1', product: 'Glifosato', quantity: 10, unit: 'litros' },
    { id: 'i2', product: 'Roundup', quantity: 5, unit: 'galões' },
  ],
  totalPriceRanking: [
    {
      supplierId: 's1',
      supplierName: 'Agro A',
      totalPrice: 1500,
      itemsCovered: 2,
      itemsTotal: 2,
      isPartial: false,
      paymentTerms: '30 dias',
      deliveryDays: 5,
      proposalId: 'p1',
    },
    {
      supplierId: 's2',
      supplierName: 'Agro B',
      totalPrice: 1700,
      itemsCovered: 2,
      itemsTotal: 2,
      isPartial: false,
      paymentTerms: '15 dias',
      deliveryDays: 3,
      proposalId: 'p2',
    },
  ],
  itemWinners: [
    {
      quoteItemId: 'i1',
      product: 'Glifosato',
      quantity: 10,
      unit: 'litros',
      winner: { supplierId: 's1', supplierName: 'Agro A', unitPrice: 50, totalPrice: 500, proposalId: 'p1' },
      allOffers: [
        { supplierId: 's1', supplierName: 'Agro A', unitPrice: 50, totalPrice: 500, proposalId: 'p1' },
        { supplierId: 's2', supplierName: 'Agro B', unitPrice: 60, totalPrice: 600, proposalId: 'p2' },
      ],
    },
  ],
  partialProposals: [],
  closedSupplierId: 's1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindProducer.mockResolvedValue({ city: 'Rio Verde', region: 'GO' });
});

describe('PdfGenerationService.buildFilename', () => {
  it('AC-04: cotacao_<id8>_<YYYY-MM-DD>.pdf', () => {
    expect(
      PdfGenerationService.buildFilename(
        'ABC12345-blah-blah',
        new Date('2026-05-14T10:00:00Z'),
      ),
    ).toBe('cotacao_abc12345_2026-05-14.pdf');
  });

  it('pad zero no mês e no dia', () => {
    expect(
      PdfGenerationService.buildFilename('abcdefgh', new Date('2026-01-05T00:00:00Z')),
    ).toBe('cotacao_abcdefgh_2026-01-05.pdf');
  });
});

describe('PdfGenerationService.generateQuoteResultPdf', () => {
  it('retorna Buffer não-vazio com filename correto para cotação completa', async () => {
    mockGetResults.mockResolvedValue(baseQuoteData);

    const result = await PdfGenerationService.generateQuoteResultPdf({
      tenantId: 't1',
      quoteId: 'abc12345-uuid',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
    // Magic number do PDF (%PDF-)
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');

    expect(result.filename).toMatch(/^cotacao_abc12345_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('gera mesmo com 1 proposta única (AC-05)', async () => {
    mockGetResults.mockResolvedValue({
      ...baseQuoteData,
      totalPriceRanking: [baseQuoteData.totalPriceRanking[0]],
    });

    const result = await PdfGenerationService.generateQuoteResultPdf({
      tenantId: 't1',
      quoteId: 'abc12345-uuid',
    });
    expect(result.buffer.length).toBeGreaterThan(100);
  });

  it('gera quando producer não tem city/region (campos opcionais)', async () => {
    mockGetResults.mockResolvedValue(baseQuoteData);
    mockFindProducer.mockResolvedValue(null);

    const result = await PdfGenerationService.generateQuoteResultPdf({
      tenantId: 't1',
      quoteId: 'abc12345-uuid',
    });
    expect(result.buffer.length).toBeGreaterThan(100);
  });

  it('propaga erro quando cotação não existe', async () => {
    mockGetResults.mockRejectedValue(new Error('Cotação não encontrada'));
    await expect(
      PdfGenerationService.generateQuoteResultPdf({
        tenantId: 't1',
        quoteId: 'inexistente',
      }),
    ).rejects.toThrow('Cotação não encontrada');
  });
});
