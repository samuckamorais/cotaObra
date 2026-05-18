// FEAT-008 (FF-BE-031): mock otplib pra evitar import ESM-only no jest CJS.
// O test não verifica TOTP — só os fluxos de auth que dependem do user.
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCK_SECRET'),
  generateURI: jest.fn(() => 'otpauth://mock'),
  verifySync: jest.fn(() => ({ valid: true, delta: 0 })),
}));

import { AuthService } from '../../../src/modules/auth/auth.service';
import { prisma } from '../../../src/config/database';
import bcrypt from 'bcryptjs';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/services/email.service', () => ({
  emailService: { sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) },
}));

const mockFindUser = prisma.user.findUnique as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('AuthService', () => {
  describe('login', () => {
    it('retorna tokens e usuário para credenciais válidas', async () => {
      const hashedPw = await bcrypt.hash('senha123', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', email: 'joao@farm.com', role: 'ADMIN',
        password: hashedPw, active: true, permissions: [],
      });

      const result = await AuthService.login({
        email: 'joao@farm.com', password: 'senha123',
      });

      expect(result.requires2FA).toBeFalsy();
      expect('accessToken' in result && result.accessToken).toBeTruthy();
      expect('refreshToken' in result && result.refreshToken).toBeTruthy();
      if ('user' in result) {
        expect(result.user.email).toBe('joao@farm.com');
        expect((result.user as Record<string, unknown>).password).toBeUndefined();
      }
    });

    it('lança erro para e-mail inexistente', async () => {
      mockFindUser.mockResolvedValue(null);
      await expect(
        AuthService.login({ email: 'nao@existe.com', password: '123' }),
      ).rejects.toThrow('E-mail ou senha inválidos');
    });

    it('lança erro para senha incorreta', async () => {
      const hashedPw = await bcrypt.hash('senha123', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', email: 'joao@farm.com', role: 'USER',
        password: hashedPw, active: true, permissions: [],
      });
      await expect(
        AuthService.login({ email: 'joao@farm.com', password: 'errada' }),
      ).rejects.toThrow('E-mail ou senha inválidos');
    });

    it('lança erro para usuário inativo', async () => {
      const hashedPw = await bcrypt.hash('senha123', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', email: 'joao@farm.com', role: 'USER',
        password: hashedPw, active: false, permissions: [],
      });
      await expect(
        AuthService.login({ email: 'joao@farm.com', password: 'senha123' }),
      ).rejects.toThrow('inativo');
    });
  });

  describe('generateTokenPair', () => {
    it('gera accessToken e refreshToken válidos', async () => {
      const result = await AuthService.generateTokenPair('user-1', 'test@test.com', 'ADMIN');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.accessToken).not.toBe(result.refreshToken);
    });
  });

  describe('refreshAccessToken', () => {
    it('lança erro para refresh token inválido', async () => {
      await expect(
        AuthService.refreshAccessToken('token-invalido'),
      ).rejects.toThrow();
    });
  });

  describe('changePassword (FEAT-008 — força mínima + zera mustChangePassword + emite tokens novos)', () => {
    it('atualiza senha forte, zera mustChangePassword e retorna par de tokens novo', async () => {
      const hashedPw = await bcrypt.hash('Antiga@2026', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', email: 'u@b.com', role: 'USER', password: hashedPw,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const tokens = await AuthService.changePassword('user-1', 'Antiga@2026', 'Nova!Senha789');

      // Retorna par de tokens (frontend substitui o JWT atual)
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            password: expect.any(String),
            mustChangePassword: false,
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('lança erro para senha atual incorreta', async () => {
      const hashedPw = await bcrypt.hash('Antiga@2026', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', password: hashedPw,
      });
      await expect(
        AuthService.changePassword('user-1', 'errada', 'Nova!Senha789'),
      ).rejects.toThrow('Senha atual inválida');
    });

    it('FEAT-008: nova senha fraca (sem símbolo) é rejeitada', async () => {
      const hashedPw = await bcrypt.hash('Antiga@2026', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', password: hashedPw,
      });
      await expect(
        AuthService.changePassword('user-1', 'Antiga@2026', 'NovaSenha789'),
      ).rejects.toThrow(/símbolo/);
    });

    it('FEAT-008: nova senha igual à atual é rejeitada', async () => {
      const hashedPw = await bcrypt.hash('Antiga@2026', 10);
      mockFindUser.mockResolvedValue({
        id: 'user-1', password: hashedPw,
      });
      await expect(
        AuthService.changePassword('user-1', 'Antiga@2026', 'Antiga@2026'),
      ).rejects.toThrow(/diferente/);
    });
  });

  describe('forgotPassword', () => {
    it('não lança erro para e-mail inexistente (previne enumeração)', async () => {
      mockFindUser.mockResolvedValue(null);
      await expect(
        AuthService.forgotPassword('nao@existe.com'),
      ).resolves.toBeUndefined();
    });

    it('envia email para usuário existente e ativo', async () => {
      const { emailService } = require('../../../src/services/email.service');
      mockFindUser.mockResolvedValue({
        id: 'user-1', name: 'João', email: 'joao@farm.com', active: true,
      });

      await AuthService.forgotPassword('joao@farm.com');
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'joao@farm.com', 'João', expect.stringContaining('reset-password'),
      );
    });
  });

  describe('resetPassword', () => {
    it('lança erro para token inexistente', async () => {
      const { redis } = require('../../../src/config/redis');
      redis.get.mockResolvedValue(null);
      await expect(
        AuthService.resetPassword('token-fake', 'nova123456'),
      ).rejects.toThrow('inválido ou expirado');
    });
  });
});
