import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Serviço para criptografar/descriptografar credenciais sensíveis
 * Usa AES-256-GCM (Galois/Counter Mode) para segurança máxima
 */
export class CredentialsEncryptorService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    // Gerar chave a partir do ENCRYPTION_KEY do env
    const encryptionKey = env.ENCRYPTION_KEY || 'default_dev_key_change_in_production_32chars!!';

    if (encryptionKey === 'default_dev_key_change_in_production_32chars!!' && env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be set in production!');
    }

    this.key = crypto.scryptSync(encryptionKey, 'salt', 32);
  }

  /**
   * Criptografa um objeto de credenciais
   */
  encrypt(credentials: Record<string, any>): string {
    try {
      // Gerar IV (Initialization Vector) único
      const iv = crypto.randomBytes(16);

      // Criar cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Criptografar
      const plaintext = JSON.stringify(credentials);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Obter authentication tag (garante integridade)
      const authTag = (cipher as any).getAuthTag();

      // Retornar tudo empacotado
      const result = {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        version: '1', // Para futuras migrações de algoritmo
      };

      return JSON.stringify(result);
    } catch (error) {
      logger.error('Failed to encrypt credentials', { error });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Descriptografa credenciais
   */
  decrypt(encryptedData: string): Record<string, any> {
    try {
      const data = JSON.parse(encryptedData);
      const { encrypted, iv, authTag, version } = data;

      if (version !== '1') {
        throw new Error(`Unsupported encryption version: ${version}`);
      }

      // Criar decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(iv, 'hex')
      );

      // Definir auth tag para validação
      (decipher as any).setAuthTag(Buffer.from(authTag, 'hex'));

      // Descriptografar
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to decrypt credentials', { error });
      throw new Error('Decryption failed - credentials may be corrupted');
    }
  }

  /**
   * Valida se uma string está criptografada corretamente
   */
  isEncrypted(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return !!(parsed.encrypted && parsed.iv && parsed.authTag && parsed.version);
    } catch {
      return false;
    }
  }

  /**
   * Mascara valores sensíveis para exibição
   */
  maskSensitiveData(value: string, visibleChars = 4): string {
    if (!value || value.length <= visibleChars) {
      return '••••••••';
    }

    const visible = value.substring(0, visibleChars);
    return `${visible}${'•'.repeat(Math.min(value.length - visibleChars, 20))}`;
  }
}

export const credentialsEncryptor = new CredentialsEncryptorService();
