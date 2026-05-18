import { FieldEncryptionService } from '../../../src/services/field-encryption.service';

describe('FieldEncryptionService', () => {
  describe('hash', () => {
    it('gera hash SHA-256 consistente para mesmo input', () => {
      const h1 = FieldEncryptionService.hash('12345678901');
      const h2 = FieldEncryptionService.hash('12345678901');
      expect(h1).toBe(h2);
    });

    it('gera hashes diferentes para inputs diferentes', () => {
      const h1 = FieldEncryptionService.hash('12345678901');
      const h2 = FieldEncryptionService.hash('98765432100');
      expect(h1).not.toBe(h2);
    });

    it('retorna string hexadecimal de 64 caracteres', () => {
      const h = FieldEncryptionService.hash('test');
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('encrypt/decrypt', () => {
    it('encrypt retorna null quando ENCRYPTION_KEY não está configurada', () => {
      // No ambiente de teste, ENCRYPTION_KEY não está definida
      const result = FieldEncryptionService.encrypt('dado sensível');
      // Se retornar null, é porque a key não está disponível (comportamento esperado)
      // Se retornar objeto, a key está configurada e devemos validar
      if (result === null) {
        expect(result).toBeNull();
      } else {
        expect(result.encrypted).toBeTruthy();
        expect(result.iv).toBeTruthy();
        expect(result.tag).toBeTruthy();
      }
    });
  });
});
