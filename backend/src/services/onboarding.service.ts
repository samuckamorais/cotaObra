import { prisma } from '../config/database';

interface OnboardingProgress {
  signup: boolean;
  firstQuote: boolean;
  firstSupplier: boolean;
  firstProposal: boolean;
  completedAt?: string;
}

export class OnboardingService {
  static async getProgress(producerId: string): Promise<OnboardingProgress> {
    // CO-0-05: contagem de fornecedores agora é por tenant (não mais por producer).
    const producer = await prisma.producer.findUnique({
      where: { id: producerId },
      select: { tenantId: true },
    });
    const tenantId = producer?.tenantId;

    const [quotesCount, suppliersCount, proposalsCount] = await Promise.all([
      prisma.quote.count({ where: { producerId } }),
      tenantId
        ? prisma.supplier.count({ where: { tenantId } })
        : Promise.resolve(0),
      prisma.proposal.count({ where: { quote: { producerId } } }),
    ]);

    return {
      signup: true,
      firstQuote: quotesCount > 0,
      firstSupplier: suppliersCount > 0,
      firstProposal: proposalsCount > 0,
      completedAt:
        quotesCount > 0 && suppliersCount > 0 && proposalsCount > 0
          ? new Date().toISOString()
          : undefined,
    };
  }
}
