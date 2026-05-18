import { ReferralService } from '../../../src/services/referral.service';
import { prisma } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    referral: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

describe('ReferralService', () => {
  describe('generateCode', () => {
    it('gera código de 8 caracteres hex uppercase', () => {
      const code = ReferralService.generateCode();
      expect(code).toMatch(/^[A-F0-9]{8}$/);
    });

    it('gera códigos únicos', () => {
      const codes = new Set(Array.from({ length: 20 }, () => ReferralService.generateCode()));
      expect(codes.size).toBe(20);
    });
  });

  describe('createReferral', () => {
    it('cria referral com código e status pending', async () => {
      (prisma.referral.create as jest.Mock).mockResolvedValue({
        id: 'ref-1', referrerId: 'prod-1', referredEmail: 'test@test.com',
        code: 'ABCD1234', status: 'pending',
      });

      const result = await ReferralService.createReferral('prod-1', 'test@test.com');
      expect(prisma.referral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referrerId: 'prod-1',
            referredEmail: 'test@test.com',
            status: 'pending',
          }),
        }),
      );
      expect(result.referrerId).toBe('prod-1');
    });
  });

  describe('getStats', () => {
    it('retorna estatísticas corretas', async () => {
      (prisma.referral.findMany as jest.Mock).mockResolvedValue([
        { code: 'A1', status: 'activated', rewardClaimed: true },
        { code: 'B2', status: 'pending', rewardClaimed: false },
        { code: 'C3', status: 'activated', rewardClaimed: false },
      ]);

      const stats = await ReferralService.getStats('prod-1');
      expect(stats.totalReferred).toBe(3);
      expect(stats.totalActivated).toBe(2);
      expect(stats.rewardsEarned).toBe(1);
    });

    it('retorna zeros para produtor sem referrals', async () => {
      (prisma.referral.findMany as jest.Mock).mockResolvedValue([]);
      const stats = await ReferralService.getStats('prod-novo');
      expect(stats.totalReferred).toBe(0);
      expect(stats.totalActivated).toBe(0);
    });
  });

  describe('activateReferral', () => {
    it('ativa referral existente', async () => {
      (prisma.referral.findUnique as jest.Mock).mockResolvedValue({
        id: 'ref-1', code: 'ABCD1234', status: 'pending', referrerId: 'prod-1',
      });
      (prisma.referral.update as jest.Mock).mockResolvedValue({ status: 'activated' });

      await ReferralService.activateReferral('ABCD1234', 'user-2');
      expect(prisma.referral.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'activated', referredId: 'user-2' }),
        }),
      );
    });

    it('lança erro para código inexistente', async () => {
      (prisma.referral.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(ReferralService.activateReferral('FAKE', 'user-2')).rejects.toThrow('não encontrado');
    });

    it('lança erro para referral já ativado', async () => {
      (prisma.referral.findUnique as jest.Mock).mockResolvedValue({
        id: 'ref-1', code: 'ABCD1234', status: 'activated',
      });
      await expect(ReferralService.activateReferral('ABCD1234', 'user-2')).rejects.toThrow('já foi ativado');
    });
  });
});
