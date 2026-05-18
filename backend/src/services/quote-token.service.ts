import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';

const DEFAULT_EXPIRY_HOURS = 2;

export class QuoteTokenService {
  /**
   * Gera token único para o produtor iniciar cotação via formulário web.
   * Reutiliza token válido se já existir.
   */
  static async generateFormUrl(
    producerId: string,
    tenantId: string,
    expiryHours: number = DEFAULT_EXPIRY_HOURS
  ): Promise<string> {
    const existing = await prisma.quoteToken.findFirst({
      where: {
        producerId,
        used: false,
        cancelled: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      return this.buildUrl(existing.token);
    }

    const token = crypto.randomBytes(6).toString('hex');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await prisma.quoteToken.create({
      data: { token, producerId, tenantId, expiresAt },
    });

    return this.buildUrl(token);
  }

  /**
   * Valida token e retorna os dados do produtor.
   * Lança erro se inválido, cancelado, expirado ou já usado.
   */
  static async validate(token: string) {
    const record = await prisma.quoteToken.findUnique({
      where: { token },
      include: {
        producer: {
          select: {
            id: true,
            name: true,
            phone: true,
            city: true,
            region: true,
            tenantId: true,
          },
        },
      },
    });

    if (!record) throw new Error('TOKEN_NOT_FOUND');
    if (record.cancelled) throw new Error('TOKEN_CANCELLED');
    if (record.used) throw new Error('TOKEN_ALREADY_USED');
    if (record.expiresAt < new Date()) throw new Error('TOKEN_EXPIRED');

    return record;
  }

  /**
   * Marca token como usado após submissão do formulário.
   */
  static async markUsed(token: string): Promise<void> {
    await prisma.quoteToken.update({
      where: { token },
      data: { used: true },
    });
  }

  /**
   * Cancela todos os tokens pendentes do produtor.
   * Chamado quando o produtor digita "cancelar" no WhatsApp.
   */
  static async cancelByProducer(producerId: string): Promise<void> {
    await prisma.quoteToken.updateMany({
      where: { producerId, used: false, cancelled: false },
      data: { cancelled: true },
    });
  }

  static buildUrl(token: string): string {
    return `${env.FRONTEND_URL}/cotacao/${token}`;
  }
}
