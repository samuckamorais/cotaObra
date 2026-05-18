import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export class RatingService {
  /**
   * Coleta rating do produtor sobre o fornecedor (1-5).
   */
  static async rateSupplier(quoteId: string, supplierId: string, score: number): Promise<void> {
    if (score < 1 || score > 5) throw new Error('Score deve ser entre 1 e 5');

    // Atualizar rating do fornecedor (média ponderada)
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const newTotal = supplier.totalProposals; // usar como peso
    const newRating = newTotal > 0
      ? (supplier.rating * (newTotal - 1) + score) / newTotal
      : score;

    await prisma.supplier.update({
      where: { id: supplierId },
      data: { rating: Math.round(newRating * 10) / 10 },
    });

    logger.info('Supplier rated', { quoteId, supplierId, score, newRating });
  }
}
