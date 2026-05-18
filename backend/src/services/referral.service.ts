import crypto from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Serviço de programa de referral.
 * Cada produtor pode gerar um código único de indicação.
 */
export class ReferralService {
  /**
   * Gera código de referral aleatório (8 caracteres hex).
   */
  static generateCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Cria um novo convite de referral para um produtor.
   */
  static async createReferral(producerId: string, referredEmail: string) {
    const code = this.generateCode();

    const referral = await prisma.referral.create({
      data: {
        referrerId: producerId,
        referredEmail,
        code,
        status: 'pending',
      },
    });

    logger.info('Referral created', { producerId, referredEmail, code });

    return referral;
  }

  /**
   * Busca estatísticas de referral do produtor.
   */
  static async getStats(producerId: string) {
    const referrals = await prisma.referral.findMany({
      where: { referrerId: producerId },
    });

    const totalReferred = referrals.length;
    const totalActivated = referrals.filter(r => r.status === 'activated').length;
    const rewardsEarned = referrals.filter(r => r.rewardClaimed).length;

    // Pegar o código mais recente ou gerar um novo
    const latestReferral = referrals[referrals.length - 1];
    const code = latestReferral?.code || this.generateCode();

    return {
      code,
      totalReferred,
      totalActivated,
      rewardsEarned,
    };
  }

  /**
   * Ativa um referral quando o indicado se cadastra.
   */
  static async activateReferral(code: string, referredId: string) {
    const referral = await prisma.referral.findUnique({
      where: { code },
    });

    if (!referral) {
      throw new Error('Código de referral não encontrado');
    }

    if (referral.status === 'activated') {
      throw new Error('Referral já foi ativado');
    }

    const updated = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: 'activated',
        referredId,
        activatedAt: new Date(),
      },
    });

    logger.info('Referral activated', { code, referredId, referrerId: referral.referrerId });

    return updated;
  }
}
