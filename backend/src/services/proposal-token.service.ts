import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';

const DEFAULT_EXPIRY_HOURS = 24;

export class ProposalTokenService {
  /**
   * Gera um token único para o par (quoteId, supplierId) e retorna a URL do formulário.
   * Se já existir token válido, reutiliza.
   * @param expiryHours tempo de expiração em horas (padrão: 24h, ou o definido nas TenantSettings)
   */
  static async generateFormUrl(
    quoteId: string,
    supplierId: string,
    expiryHours: number = DEFAULT_EXPIRY_HOURS
  ): Promise<string> {
    // Reutilizar token não-utilizado ainda válido
    const existing = await prisma.proposalToken.findFirst({
      where: {
        quoteId,
        supplierId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      return this.buildUrl(existing.token);
    }

    const token = crypto.randomBytes(4).toString('hex');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await prisma.proposalToken.create({
      data: { token, quoteId, supplierId, expiresAt },
    });

    return this.buildUrl(token);
  }

  /**
   * Valida um token e retorna os dados associados.
   * Lança erro se inválido, expirado ou já usado.
   */
  static async validate(token: string) {
    const record = await prisma.proposalToken.findUnique({
      where: { token },
      include: {
        quote: {
          include: {
            items: true,
            producer: { select: { name: true, city: true } },
          },
        },
        supplier: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!record) {
      throw new Error('TOKEN_NOT_FOUND');
    }

    if (record.used) {
      throw new Error('TOKEN_ALREADY_USED');
    }

    if (record.expiresAt < new Date()) {
      throw new Error('TOKEN_EXPIRED');
    }

    if (record.quote.status === 'CLOSED' || record.quote.status === 'EXPIRED') {
      throw new Error('QUOTE_CLOSED');
    }

    return record;
  }

  /**
   * Marca token como usado após submissão da proposta.
   */
  static async markUsed(token: string): Promise<void> {
    await prisma.proposalToken.update({
      where: { token },
      data: { used: true },
    });
  }

  private static buildUrl(token: string): string {
    return `${env.FRONTEND_URL}/p/${token}`;
  }
}
