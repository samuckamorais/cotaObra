import { AuthTokenService } from '../../../src/services/auth-token.service';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/redis', () => ({
  redis: {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    keys: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockRedis = redis as unknown as {
  setex: jest.Mock; get: jest.Mock; del: jest.Mock; exists: jest.Mock; keys: jest.Mock;
};

beforeEach(() => jest.resetAllMocks());

describe('AuthTokenService', () => {
  describe('generateTokenId', () => {
    it('gera UUID válido', () => {
      const id = AuthTokenService.generateTokenId();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('gera IDs únicos', () => {
      const ids = new Set(Array.from({ length: 10 }, () => AuthTokenService.generateTokenId()));
      expect(ids.size).toBe(10);
    });
  });

  describe('storeRefreshToken', () => {
    it('armazena token no Redis com TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      await AuthTokenService.storeRefreshToken('user-1', 'token-1', 7200);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'refresh:user-1:token-1',
        7200,
        expect.stringContaining('user-1'),
      );
    });
  });

  describe('validateRefreshToken', () => {
    it('retorna true se token existe', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await AuthTokenService.validateRefreshToken('user-1', 'token-1');
      expect(result).toBe(true);
    });

    it('retorna false se token não existe', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await AuthTokenService.validateRefreshToken('user-1', 'token-1');
      expect(result).toBe(false);
    });

    it('retorna false se Redis falhar', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis down'));
      const result = await AuthTokenService.validateRefreshToken('user-1', 'token-1');
      expect(result).toBe(false);
    });
  });

  describe('revokeRefreshToken', () => {
    it('deleta token do Redis', async () => {
      mockRedis.del.mockResolvedValue(1);
      await AuthTokenService.revokeRefreshToken('user-1', 'token-1');
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-1:token-1');
    });

    it('não lança erro se Redis falhar', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis down'));
      await expect(AuthTokenService.revokeRefreshToken('user-1', 'token-1')).resolves.toBeUndefined();
    });
  });

  describe('revokeAllRefreshTokens', () => {
    it('deleta todos os tokens do usuário', async () => {
      mockRedis.keys.mockResolvedValue(['refresh:user-1:t1', 'refresh:user-1:t2']);
      mockRedis.del.mockResolvedValue(2);
      await AuthTokenService.revokeAllRefreshTokens('user-1');
      expect(mockRedis.keys).toHaveBeenCalledWith('refresh:user-1:*');
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-1:t1', 'refresh:user-1:t2');
    });

    it('não chama del se não há tokens', async () => {
      mockRedis.keys.mockResolvedValue([]);
      await AuthTokenService.revokeAllRefreshTokens('user-1');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('blacklistAccessToken', () => {
    it('armazena jti na blacklist com TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      await AuthTokenService.blacklistAccessToken('jti-abc', 900);
      expect(mockRedis.setex).toHaveBeenCalledWith('blacklist:jti-abc', 900, '1');
    });

    it('não armazena se TTL <= 0', async () => {
      await AuthTokenService.blacklistAccessToken('jti-abc', 0);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('não armazena se TTL negativo', async () => {
      await AuthTokenService.blacklistAccessToken('jti-abc', -10);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('isBlacklisted', () => {
    it('retorna true se jti está na blacklist', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await AuthTokenService.isBlacklisted('jti-abc');
      expect(result).toBe(true);
    });

    it('retorna false se jti não está na blacklist', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await AuthTokenService.isBlacklisted('jti-abc');
      expect(result).toBe(false);
    });

    it('retorna false (fail-open) se Redis falhar', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis down'));
      const result = await AuthTokenService.isBlacklisted('jti-abc');
      expect(result).toBe(false);
    });
  });
});
