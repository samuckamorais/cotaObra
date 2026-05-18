import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface EncryptedField {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Serviço para criptografia de campos sensíveis individuais (CPF, CNPJ, etc.)
 * Usa AES-256-GCM para criptografia e SHA-256 para hash de busca.
 *
 * AUD-02 (CO-0-10): cada chamada de `encrypt` gera um IV aleatório de 16 bytes
 * via `crypto.randomBytes(IV_LENGTH)`, gravado junto com o ciphertext. Isso
 * impede oracle-mode attacks que existiriam se o IV fosse fixo ou derivado
 * deterministicamente da chave. Confirmado correto no fork CotaObra.
 */
export class FieldEncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;

  /**
   * Deriva a chave de criptografia a partir de ENCRYPTION_KEY.
   * Retorna null se a chave não estiver configurada.
   */
  private static getKey(): Buffer | null {
    const encryptionKey = env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return null;
    }
    return crypto.scryptSync(encryptionKey, 'field-encryption-salt', 32);
  }

  /**
   * Criptografa um valor de texto plano usando AES-256-GCM.
   * Retorna null se ENCRYPTION_KEY não estiver configurada.
   */
  static encrypt(plaintext: string): EncryptedField | null {
    const key = this.getKey();
    if (!key) {
      logger.warn('ENCRYPTION_KEY not configured, skipping field encryption');
      return null;
    }

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      logger.error('Field encryption failed', { error });
      throw new Error('Field encryption failed');
    }
  }

  /**
   * Descriptografa um valor criptografado com AES-256-GCM.
   * Retorna null se ENCRYPTION_KEY não estiver configurada.
   */
  static decrypt(encrypted: string, iv: string, tag: string): string | null {
    const key = this.getKey();
    if (!key) {
      logger.warn('ENCRYPTION_KEY not configured, cannot decrypt');
      return null;
    }

    try {
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        key,
        Buffer.from(iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Field decryption failed', { error });
      throw new Error('Field decryption failed - data may be corrupted');
    }
  }

  /**
   * Gera um hash SHA-256 para buscas indexadas (não reversível).
   * Permite buscar registros por CPF/CNPJ sem precisar descriptografar.
   */
  static hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Criptografa um campo e retorna tanto o valor criptografado (JSON) quanto o hash.
   * Conveniente para gravar cpfCnpjEncrypted e cpfCnpjHash de uma vez.
   */
  static encryptWithHash(plaintext: string): { encryptedJson: string | null; hash: string } {
    const encResult = this.encrypt(plaintext);
    const hashValue = this.hash(plaintext);

    return {
      encryptedJson: encResult ? JSON.stringify(encResult) : null,
      hash: hashValue,
    };
  }

  /**
   * Descriptografa um campo a partir do JSON armazenado no banco.
   */
  static decryptFromJson(encryptedJson: string): string | null {
    try {
      const parsed: EncryptedField = JSON.parse(encryptedJson);
      return this.decrypt(parsed.encrypted, parsed.iv, parsed.tag);
    } catch (error) {
      logger.error('Failed to parse encrypted field JSON', { error });
      throw new Error('Failed to decrypt field - invalid format');
    }
  }
}
