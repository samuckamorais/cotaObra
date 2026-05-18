jest.mock('../../../src/config/database', () => ({
  prisma: {
    quote: { count: jest.fn() },
    producerSupplier: { count: jest.fn() },
    proposal: { count: jest.fn() },
  },
}));

import { OnboardingService } from '../../../src/services/onboarding.service';
import { prisma } from '../../../src/config/database';

const mockQuoteCount = prisma.quote.count as jest.Mock;
const mockSupplierCount = (prisma as any).producerSupplier.count as jest.Mock;
const mockProposalCount = (prisma as any).proposal.count as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('OnboardingService', () => {
  describe('getProgress', () => {
    it('retorna todos false para produtor novo (0 quotes, 0 suppliers, 0 proposals)', async () => {
      mockQuoteCount.mockResolvedValue(0);
      mockSupplierCount.mockResolvedValue(0);
      mockProposalCount.mockResolvedValue(0);

      const result = await OnboardingService.getProgress('prod-1');

      expect(result.signup).toBe(true);
      expect(result.firstQuote).toBe(false);
      expect(result.firstSupplier).toBe(false);
      expect(result.firstProposal).toBe(false);
      expect(result.completedAt).toBeUndefined();
    });

    it('retorna firstQuote=true quando existem cotações', async () => {
      mockQuoteCount.mockResolvedValue(3);
      mockSupplierCount.mockResolvedValue(0);
      mockProposalCount.mockResolvedValue(0);

      const result = await OnboardingService.getProgress('prod-1');

      expect(result.firstQuote).toBe(true);
      expect(result.firstSupplier).toBe(false);
      expect(result.completedAt).toBeUndefined();
    });

    it('retorna completedAt quando todas as etapas completas', async () => {
      mockQuoteCount.mockResolvedValue(1);
      mockSupplierCount.mockResolvedValue(2);
      mockProposalCount.mockResolvedValue(1);

      const result = await OnboardingService.getProgress('prod-1');

      expect(result.firstQuote).toBe(true);
      expect(result.firstSupplier).toBe(true);
      expect(result.firstProposal).toBe(true);
      expect(result.completedAt).toBeDefined();
    });
  });
});
