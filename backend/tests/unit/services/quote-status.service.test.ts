import { QuoteStatusService } from '../../../src/services/quote-status.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    quote: {
      findMany: jest.fn(),
    },
  },
}));

const mockFindMany = prisma.quote.findMany as unknown as jest.Mock;

const PRODUCER_ID = 'prod-1';
const TENANT_ID = 'tenant-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('QuoteStatusService.getActiveQuotes()', () => {
  it('retorna lista vazia quando produtor não tem cotações ativas', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await QuoteStatusService.getActiveQuotes(PRODUCER_ID, TENANT_ID);

    expect(result).toEqual([]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          producerId: PRODUCER_ID,
          tenantId: TENANT_ID,
          status: { in: ['PENDING', 'COLLECTING'] },
        }),
      }),
    );
  });

  it('mapeia cotação 1-item para snapshot com summary "categoria — produto"', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'q-1',
        category: 'Sementes',
        items: [{ product: 'Soja Intacta' }],
        expiresAt: new Date('2026-05-01T20:00:00Z'),
        _count: { proposals: 2, supplierNotifications: 5 },
      },
    ]);

    const result = await QuoteStatusService.getActiveQuotes(PRODUCER_ID, TENANT_ID);

    expect(result).toEqual([
      {
        quoteId: 'q-1',
        summary: 'Sementes — Soja Intacta',
        respondedCount: 2,
        totalSuppliers: 5,
        expiresAt: new Date('2026-05-01T20:00:00Z'),
      },
    ]);
  });

  it('encurta lista de itens quando há mais de 3 produtos', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'q-1',
        category: 'Defensivos',
        items: [
          { product: 'Glifosato' },
          { product: 'Atrazina' },
          { product: 'Lambda' },
          { product: 'Imidacloprido' },
          { product: 'Mancozebe' },
        ],
        expiresAt: new Date(),
        _count: { proposals: 0, supplierNotifications: 3 },
      },
    ]);

    const [snap] = await QuoteStatusService.getActiveQuotes(PRODUCER_ID, TENANT_ID);
    expect(snap.summary).toBe('Defensivos — Glifosato, Atrazina, +3 itens');
  });

  it('não inclui cotações de outro tenant (filtro por tenantId é obrigatório)', async () => {
    mockFindMany.mockResolvedValue([]);
    await QuoteStatusService.getActiveQuotes(PRODUCER_ID, 'tenant-A');

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe('tenant-A');
    expect(call.where.producerId).toBe(PRODUCER_ID);
  });

  it('só considera status PENDING e COLLECTING', async () => {
    mockFindMany.mockResolvedValue([]);
    await QuoteStatusService.getActiveQuotes(PRODUCER_ID, TENANT_ID);

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ['PENDING', 'COLLECTING'] });
  });
});
