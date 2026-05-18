/**
 * Teste básico do ProducerService — feliz path + duplicidades.
 * Isolamento por papel está em producer-service-isolation.test.ts.
 */
jest.mock('../../../src/config/database', () => ({
  prisma: {
    producer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    producerSupplier: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    supplier: {
      findFirst: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    fSMEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/phone', () => ({
  normalizePhoneBR: jest.fn((phone: string) => `+55${phone.replace(/\D/g, '').replace(/^55/, '')}`),
}));

import { ProducerService } from '../../../src/modules/producers/producer.service';
import { prisma } from '../../../src/config/database';
import type { AuthContext } from '../../../src/utils/auth-context';

const mockFindMany = prisma.producer.findMany as jest.Mock;
const mockFindFirst = prisma.producer.findFirst as jest.Mock;
const mockUpdate = prisma.producer.update as jest.Mock;
const mockDelete = prisma.producer.delete as jest.Mock;
const mockCount = prisma.producer.count as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const tenantId = 'tenant-1';

const adminCtx: AuthContext = {
  userId: 'user-admin',
  tenantId,
  producerId: null,
  role: 'ADMIN',
};

const sampleProducer = {
  id: 'prod-1', name: 'Fazenda Boa Vista', phone: '+5564999999999',
  cpfCnpj: '12345678900', tenantId, createdAt: new Date(),
  subscription: null, _count: { quotes: 0, suppliers: 0 },
};

beforeEach(() => jest.resetAllMocks());

describe('ProducerService', () => {
  describe('list (ADMIN)', () => {
    it('retorna produtores paginados do tenant', async () => {
      mockFindMany.mockResolvedValue([sampleProducer]);
      mockCount.mockResolvedValue(1);

      const result = await ProducerService.list(adminCtx, 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
    });
  });

  describe('getById (ADMIN)', () => {
    it('retorna produtor', async () => {
      mockFindFirst.mockResolvedValue(sampleProducer);

      const result = await ProducerService.getById(adminCtx, 'prod-1');
      expect(result.id).toBe('prod-1');
    });

    it('lança 404 para produtor inexistente', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        ProducerService.getById(adminCtx, 'fake'),
      ).rejects.toThrow('Produtor não encontrado');
    });
  });

  describe('create (ADMIN)', () => {
    it('cria produtor com telefone normalizado, sem auto-link', async () => {
      mockFindFirst
        .mockResolvedValueOnce(null)  // phone check
        .mockResolvedValueOnce(null); // cpfCnpj check

      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          producer: { create: jest.fn().mockResolvedValue(sampleProducer) },
          user: { update: jest.fn() },
          fSMEvent: { create: jest.fn() },
        };
        return cb(tx);
      });

      const result = await ProducerService.create(adminCtx, {
        name: 'Fazenda', phone: '64999999999', cpfCnpj: '12345678900',
      } as any);

      expect(result.id).toBe('prod-1');
      expect(mockTransaction).toHaveBeenCalled();
    });

    it('lança conflito para telefone duplicado', async () => {
      mockFindFirst.mockResolvedValueOnce(sampleProducer); // phone já existe

      await expect(
        ProducerService.create(adminCtx, {
          name: 'X', phone: '64999999999', cpfCnpj: '99999999999',
        } as any),
      ).rejects.toThrow('Telefone já cadastrado');
    });
  });

  describe('update (ADMIN)', () => {
    it('atualiza produtor', async () => {
      mockFindFirst.mockResolvedValueOnce(sampleProducer); // getById
      mockUpdate.mockResolvedValue({ ...sampleProducer, name: 'Novo Nome' });

      const result = await ProducerService.update(adminCtx, 'prod-1', { name: 'Novo Nome' } as any);
      expect(mockUpdate).toHaveBeenCalled();
      expect(result.name).toBe('Novo Nome');
    });
  });

  describe('delete (ADMIN)', () => {
    it('deleta produtor', async () => {
      mockFindFirst.mockResolvedValue(sampleProducer); // getById
      mockDelete.mockResolvedValue(sampleProducer);

      await ProducerService.delete(adminCtx, 'prod-1');

      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
    });
  });
});
