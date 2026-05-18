/**
 * CO-0-05: OnboardingService.getProgress agora resolve fornecedores via
 * `supplier.count({ where: { tenantId } })` em vez de `producerSupplier.count`.
 * O mock precisa de `producer.findUnique` para retornar o tenantId e
 * `supplier.count` (em vez do antigo `producerSupplier.count`).
 */
jest.mock('../../../src/config/database', () => ({
  prisma: {
    producer: { findUnique: jest.fn() },
    quote: { count: jest.fn() },
    supplier: { count: jest.fn() },
    proposal: { count: jest.fn() },
  },
}));

import { OnboardingService } from '../../../src/services/onboarding.service';
import { prisma } from '../../../src/config/database';

const mockProducerFindUnique = prisma.producer.findUnique as jest.Mock;
const mockQuoteCount = prisma.quote.count as jest.Mock;
const mockSupplierCount = prisma.supplier.count as jest.Mock;
const mockProposalCount = prisma.proposal.count as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  // Produtor padrão (com tenant) para todos os testes.
  mockProducerFindUnique.mockResolvedValue({ tenantId: 'tenant-1' });
});

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

      expect(result.signup).toBe(true);
      expect(result.firstQuote).toBe(true);
      expect(result.firstSupplier).toBe(true);
      expect(result.firstProposal).toBe(true);
      expect(result.completedAt).toBeDefined();
    });

    it('retorna 0 suppliers se producer não tem tenant', async () => {
      mockProducerFindUnique.mockResolvedValue(null);
      mockQuoteCount.mockResolvedValue(0);
      mockProposalCount.mockResolvedValue(0);

      const result = await OnboardingService.getProgress('prod-orphan');

      expect(result.firstSupplier).toBe(false);
    });
  });
});
