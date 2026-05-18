import { RatingService } from '../../../src/services/rating.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    supplier: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

describe('RatingService', () => {
  describe('rateSupplier', () => {
    it('atualiza rating do fornecedor com média ponderada', async () => {
      (prisma.supplier.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'sup-1', rating: 4.0, totalProposals: 10,
      });
      (prisma.supplier.update as jest.Mock).mockResolvedValue({});

      await RatingService.rateSupplier('q-1', 'sup-1', 5);

      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1' },
          data: expect.objectContaining({ rating: expect.any(Number) }),
        }),
      );
    });

    it('aceita score 1 (mínimo)', async () => {
      (prisma.supplier.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'sup-1', rating: 3.0, totalProposals: 5,
      });
      (prisma.supplier.update as jest.Mock).mockResolvedValue({});

      await expect(RatingService.rateSupplier('q-1', 'sup-1', 1)).resolves.toBeUndefined();
    });

    it('aceita score 5 (máximo)', async () => {
      (prisma.supplier.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'sup-1', rating: 4.5, totalProposals: 20,
      });
      (prisma.supplier.update as jest.Mock).mockResolvedValue({});

      await expect(RatingService.rateSupplier('q-1', 'sup-1', 5)).resolves.toBeUndefined();
    });

    it('rejeita score < 1', async () => {
      await expect(RatingService.rateSupplier('q-1', 'sup-1', 0)).rejects.toThrow('Score deve ser entre 1 e 5');
    });

    it('rejeita score > 5', async () => {
      await expect(RatingService.rateSupplier('q-1', 'sup-1', 6)).rejects.toThrow('Score deve ser entre 1 e 5');
    });

    it('define score como rating direto para fornecedor sem propostas', async () => {
      (prisma.supplier.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'sup-1', rating: 0, totalProposals: 0,
      });
      (prisma.supplier.update as jest.Mock).mockResolvedValue({});

      await RatingService.rateSupplier('q-1', 'sup-1', 4);

      expect(prisma.supplier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rating: 4 }),
        }),
      );
    });
  });
});
