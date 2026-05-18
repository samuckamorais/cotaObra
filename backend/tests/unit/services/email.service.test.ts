jest.mock('../../../src/config/env', () => ({
  env: {
    SMTP_HOST: undefined, // Dev mode — sem SMTP configurado
    SMTP_PORT: 587,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: 'noreply@cotaobra.com.br',
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { emailService } from '../../../src/services/email.service';
import { logger } from '../../../src/utils/logger';

beforeEach(() => jest.resetAllMocks());

describe('EmailService', () => {
  describe('sendMail', () => {
    it('loga email em modo dev (sem SMTP_HOST)', async () => {
      await emailService.sendMail('user@test.com', 'Assunto', '<p>body</p>');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DEV]'),
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Assunto',
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('chama sendMail com assunto e template corretos', async () => {
      await emailService.sendPasswordResetEmail(
        'user@test.com', 'João', 'https://app.cotaobra.com/reset-password?token=abc',
      );

      // Em dev mode, o email é logado — verificamos que logger.info foi chamado
      // com os dados corretos
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DEV]'),
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Recuperação de senha — CotaObra',
        }),
      );
    });
  });
});
