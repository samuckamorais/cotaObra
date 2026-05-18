import { redis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Serviço de geração e validação de códigos OTP (One-Time Password)
 * Códigos são armazenados no Redis com TTL de 10 minutos
 */
export class OTPService {
  private static readonly OTP_TTL = 600; // 10 minutos em segundos

  /**
   * Gera um código OTP de 6 dígitos
   */
  static generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Salva código OTP no Redis associado a um telefone
   */
  static async saveCode(phone: string, code: string): Promise<void> {
    const key = `otp:${phone}`;
    await redis.setex(key, this.OTP_TTL, code);
    logger.info(`OTP generated for phone ${phone}`, { phone });
  }

  /**
   * Valida código OTP fornecido pelo usuário
   */
  static async validateCode(phone: string, code: string): Promise<boolean> {
    const key = `otp:${phone}`;
    const storedCode = await redis.get(key);

    if (!storedCode) {
      logger.warn(`OTP validation failed: code not found for ${phone}`, { phone });
      return false;
    }

    const isValid = storedCode === code;

    if (isValid) {
      // Remove código após validação bem-sucedida
      await redis.del(key);
      logger.info(`OTP validated successfully for ${phone}`, { phone });
    } else {
      logger.warn(`OTP validation failed: invalid code for ${phone}`, { phone });
    }

    return isValid;
  }

  /**
   * Remove código OTP do Redis
   */
  static async deleteCode(phone: string): Promise<void> {
    const key = `otp:${phone}`;
    await redis.del(key);
  }

  /**
   * Verifica se já existe um código OTP ativo para o telefone
   */
  static async hasActiveCode(phone: string): Promise<boolean> {
    const key = `otp:${phone}`;
    const exists = await redis.exists(key);
    return exists === 1;
  }

  /**
   * Obtém o tempo restante (em segundos) de um código OTP
   */
  static async getCodeTTL(phone: string): Promise<number> {
    const key = `otp:${phone}`;
    return await redis.ttl(key);
  }
}
