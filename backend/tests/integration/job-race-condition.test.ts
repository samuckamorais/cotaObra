/**
 * Testes de race condition entre os jobs consolidate-quote e expire-quotes.
 *
 * Verifica que o JobLockService garante processamento exclusivo por cotação,
 * impedindo que dois jobs processem a mesma cotação simultaneamente.
 */

// Mocks devem ser declarados antes dos imports (Jest os eleva automaticamente)
jest.mock('../../src/config/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logWithContext: jest.fn(),
}));

import { JobLockService } from '../../src/services/job-lock.service';
import { redis } from '../../src/config/redis';
import { logger } from '../../src/utils/logger';

// Tipos auxiliares para evitar casting repetido
const mockRedis = redis as unknown as { set: jest.Mock; get: jest.Mock; del: jest.Mock };
const mockLogger = logger as unknown as { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

// Opções rápidas para não aguardar 5s nos testes
const FAST_OPTS = { timeoutMs: 200, retryIntervalMs: 50 };

describe('JobLockService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // acquire
  // ─────────────────────────────────────────────
  describe('acquire', () => {
    it('retorna true e loga quando lock está livre (SET NX retorna OK)', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await JobLockService.acquire('quote-123', 'consolidate', FAST_OPTS);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'quote:processing:quote-123',
        'consolidate',
        'EX',
        30,
        'NX',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job lock acquired',
        expect.objectContaining({ quoteId: 'quote-123', jobName: 'consolidate' }),
      );
    });

    it('retorna false quando lock está ocupado e timeout expira', async () => {
      // SET NX sempre falha — simula lock mantido por outro job
      mockRedis.set.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue('consolidate');

      const result = await JobLockService.acquire('quote-456', 'expire', FAST_OPTS);

      expect(result).toBe(false);
      // Deve ter retentado (mais de uma chamada ao set)
      expect(mockRedis.set.mock.calls.length).toBeGreaterThan(1);
    });

    it('loga warning com o detentor do lock quando timeout expira', async () => {
      mockRedis.set.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue('consolidate');

      await JobLockService.acquire('quote-789', 'expire', FAST_OPTS);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job lock timeout — skipping quote',
        expect.objectContaining({
          quoteId: 'quote-789',
          jobName: 'expire',
          heldBy: 'consolidate',
        }),
      );
    });

    it('usa TTL padrão de 30 segundos', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await JobLockService.acquire('quote-ttl', 'expire', FAST_OPTS);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        'expire',
        'EX',
        30, // TTL padrão
        'NX',
      );
    });

    it('usa TTL customizado quando fornecido', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await JobLockService.acquire('quote-custom', 'expire', {
        ...FAST_OPTS,
        ttlSeconds: 60,
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        'expire',
        'EX',
        60,
        'NX',
      );
    });
  });

  // ─────────────────────────────────────────────
  // release
  // ─────────────────────────────────────────────
  describe('release', () => {
    it('deleta a chave quando o job é o dono do lock', async () => {
      mockRedis.get.mockResolvedValue('consolidate');
      mockRedis.del.mockResolvedValue(1);

      await JobLockService.release('quote-123', 'consolidate');

      expect(mockRedis.del).toHaveBeenCalledWith('quote:processing:quote-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job lock released',
        expect.objectContaining({ quoteId: 'quote-123', jobName: 'consolidate' }),
      );
    });

    it('NÃO deleta quando o job não é o dono (proteção contra liberar lock alheio)', async () => {
      // Lock pertence ao job consolidate
      mockRedis.get.mockResolvedValue('consolidate');

      // Expire tenta liberar — não deve deletar
      await JobLockService.release('quote-123', 'expire');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('NÃO deleta quando o lock já expirou (TTL venceu — get retorna null)', async () => {
      mockRedis.get.mockResolvedValue(null);

      await JobLockService.release('quote-expired', 'consolidate');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // isLocked
  // ─────────────────────────────────────────────
  describe('isLocked', () => {
    it('retorna true quando há lock ativo', async () => {
      mockRedis.get.mockResolvedValue('consolidate');
      expect(await JobLockService.isLocked('quote-abc')).toBe(true);
    });

    it('retorna false quando não há lock', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await JobLockService.isLocked('quote-abc')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // lockKey
  // ─────────────────────────────────────────────
  describe('lockKey', () => {
    it('gera chave com prefixo correto', () => {
      expect(JobLockService.lockKey('quote-123')).toBe('quote:processing:quote-123');
    });
  });

  // ─────────────────────────────────────────────
  // Race condition: dois jobs na mesma cotação
  // ─────────────────────────────────────────────
  describe('dois jobs competindo pela mesma cotação', () => {
    it('apenas UM job adquire o lock quando ambos iniciam simultaneamente', async () => {
      let setCallCount = 0;

      // Simula o comportamento atômico do Redis SET NX:
      // primeira chamada → OK (lock adquirido)
      // chamadas subsequentes → null (lock já existe)
      mockRedis.set.mockImplementation(() => {
        setCallCount++;
        return Promise.resolve(setCallCount === 1 ? 'OK' : null);
      });
      mockRedis.get.mockResolvedValue('consolidate');

      const [resultConsolidate, resultExpire] = await Promise.all([
        JobLockService.acquire('quote-race', 'consolidate', FAST_OPTS),
        JobLockService.acquire('quote-race', 'expire', FAST_OPTS),
      ]);

      const acquiredCount = [resultConsolidate, resultExpire].filter(Boolean).length;

      expect(acquiredCount).toBe(1);
    });

    it('segundo job falha e loga warning — não processa a cotação', async () => {
      let setCallCount = 0;
      mockRedis.set.mockImplementation(() => {
        setCallCount++;
        return Promise.resolve(setCallCount === 1 ? 'OK' : null);
      });
      mockRedis.get.mockResolvedValue('consolidate');

      await Promise.all([
        JobLockService.acquire('quote-race2', 'consolidate', FAST_OPTS),
        JobLockService.acquire('quote-race2', 'expire', FAST_OPTS),
      ]);

      // Warning deve ter sido logado para o job que falhou
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job lock timeout — skipping quote',
        expect.objectContaining({ quoteId: 'quote-race2' }),
      );
    });

    it('segundo job pode adquirir o lock após o primeiro liberar', async () => {
      // Primeiro acquire: OK. Depois del, próximo acquire: OK novamente.
      mockRedis.set
        .mockResolvedValueOnce('OK')   // job 1 adquire
        .mockResolvedValueOnce('OK');  // job 2 adquire após release

      mockRedis.get.mockResolvedValue('consolidate');
      mockRedis.del.mockResolvedValue(1);

      const firstAcquired = await JobLockService.acquire('quote-seq', 'consolidate', FAST_OPTS);
      await JobLockService.release('quote-seq', 'consolidate');
      const secondAcquired = await JobLockService.acquire('quote-seq', 'expire', FAST_OPTS);

      expect(firstAcquired).toBe(true);
      expect(secondAcquired).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });
  });
});
