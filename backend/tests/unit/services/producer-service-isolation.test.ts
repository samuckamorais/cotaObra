/**
 * FF-BE-026 — Isolamento USER↔Producer + auto-link no cadastro.
 *
 * Cobre os 11 cenários da spec do PO:
 *  1. USER cria producer com auto-link
 *  2. USER já vinculado tenta criar 2º producer → 409
 *  3. USER lista producers → vê apenas o seu
 *  4. USER tenta acessar producer de outro user → 404
 *  5. ADMIN cria producer sem auto-link
 *  6. ADMIN lista todos do tenant
 *  7. SUPER_ADMIN lista cross-tenant
 *  8. USER sem producer ainda → lista vazia
 *  9. (script de migração — cobertura via migrate-producer-links.test.ts)
 * 10. (idem)
 * 11. getSuppliers respeita isolamento
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
  normalizePhoneBR: (p: string) => p,
}));

import { ProducerService } from '../../../src/modules/producers/producer.service';
import { prisma } from '../../../src/config/database';
import type { AuthContext } from '../../../src/utils/auth-context';

const mockFindMany = prisma.producer.findMany as jest.Mock;
const mockFindFirst = prisma.producer.findFirst as jest.Mock;
const mockCount = prisma.producer.count as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockPSFindMany = prisma.producerSupplier.findMany as jest.Mock;

const tenantA = 'tenant-1';
const tenantB = 'tenant-2';

const userNewCtx: AuthContext = {
  userId: 'user-new',
  tenantId: tenantA,
  producerId: null, // ainda não criou producer
  role: 'USER',
};

const userLinkedCtx: AuthContext = {
  userId: 'user-1',
  tenantId: tenantA,
  producerId: 'prod-1',
  role: 'USER',
};

const userOtherCtx: AuthContext = {
  userId: 'user-2',
  tenantId: tenantA,
  producerId: 'prod-2',
  role: 'USER',
};

const adminCtx: AuthContext = {
  userId: 'user-admin',
  tenantId: tenantA,
  producerId: null,
  role: 'ADMIN',
};

const superAdminCtx: AuthContext = {
  userId: 'user-super',
  tenantId: tenantA, // ignorado para super_admin
  producerId: null,
  role: 'SUPER_ADMIN',
};

const sampleProducer = (id: string, t = tenantA) => ({
  id,
  name: `Producer ${id}`,
  phone: `+55649999${id}`,
  cpfCnpj: `123456789${id}`,
  tenantId: t,
  createdAt: new Date(),
  subscription: null,
  _count: { quotes: 0, suppliers: 0 },
});

beforeEach(() => {
  jest.resetAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe('Cenário 1 — USER cria producer com auto-link', () => {
  it('USER (producerId=null) cria producer + auto-link em transação + FSMEvent', async () => {
    mockFindFirst
      .mockResolvedValueOnce(null) // phone check
      .mockResolvedValueOnce(null); // cpfCnpj check

    const txUserUpdate = jest.fn();
    const txFSMCreate = jest.fn();
    const txProducerCreate = jest.fn().mockResolvedValue(sampleProducer('prod-new'));

    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        producer: { create: txProducerCreate },
        user: { update: txUserUpdate },
        fSMEvent: { create: txFSMCreate },
      };
      return cb(tx);
    });

    await ProducerService.create(userNewCtx, {
      name: 'Fazenda Nova',
      phone: '+5564999999999',
      cpfCnpj: '12345678900',
    } as any);

    expect(txProducerCreate).toHaveBeenCalled();
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: userNewCtx.userId },
      data: { producerId: 'prod-new' },
    });
    expect(txFSMCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        producerId: 'prod-new',
        eventType: 'producer_auto_linked_to_user',
        payload: expect.objectContaining({
          userId: userNewCtx.userId,
          tenantId: tenantA,
        }),
      }),
    });
  });
});

describe('Cenário 2 — USER já vinculado tenta criar 2º producer', () => {
  it('USER (producerId=prod-1) recebe 409', async () => {
    await expect(
      ProducerService.create(userLinkedCtx, {
        name: 'Outra Fazenda',
        phone: '+5564988888888',
        cpfCnpj: '99999999999',
      } as any),
    ).rejects.toThrow('Você já tem um producer cadastrado');

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('Cenário 3 — USER lista producers (vê apenas o seu)', () => {
  it('USER recebe lista filtrada por id = ctx.producerId', async () => {
    mockFindMany.mockResolvedValue([sampleProducer('prod-1')]);
    mockCount.mockResolvedValue(1);

    const result = await ProducerService.list(userLinkedCtx, 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('prod-1');

    const callWhere = mockFindMany.mock.calls[0][0].where;
    expect(callWhere).toEqual({ id: 'prod-1', tenantId: tenantA });
  });
});

describe('Cenário 4 — USER tenta acessar producer de outro user', () => {
  it('USER (producerId=prod-1) tenta getById(prod-2) → 404', async () => {
    await expect(
      ProducerService.getById(userLinkedCtx, 'prod-2'),
    ).rejects.toThrow('Produtor não encontrado');

    // Não chega no DB — short-circuit no check de isolamento
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('USER (producerId=prod-2) NÃO vê suppliers de prod-1', async () => {
    await expect(
      ProducerService.getSuppliers(userOtherCtx, 'prod-1'),
    ).rejects.toThrow('Produtor não encontrado');

    expect(mockPSFindMany).not.toHaveBeenCalled();
  });
});

describe('Cenário 5 — ADMIN cria producer sem auto-link', () => {
  it('ADMIN cria producer e User.producerId NÃO é atualizado', async () => {
    mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const txUserUpdate = jest.fn();
    const txFSMCreate = jest.fn();
    const txProducerCreate = jest.fn().mockResolvedValue(sampleProducer('prod-3'));

    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        producer: { create: txProducerCreate },
        user: { update: txUserUpdate },
        fSMEvent: { create: txFSMCreate },
      };
      return cb(tx);
    });

    await ProducerService.create(adminCtx, {
      name: 'Fazenda Admin',
      phone: '+5564977777777',
      cpfCnpj: '11122233344',
    } as any);

    expect(txProducerCreate).toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txFSMCreate).not.toHaveBeenCalled();
  });
});

describe('Cenário 6 — ADMIN lista todos do tenant', () => {
  it('ADMIN recebe todos os producers do tenant (sem filtro por id)', async () => {
    mockFindMany.mockResolvedValue([sampleProducer('prod-1'), sampleProducer('prod-2'), sampleProducer('prod-3')]);
    mockCount.mockResolvedValue(3);

    const result = await ProducerService.list(adminCtx, 1, 10);

    expect(result.data).toHaveLength(3);

    const callWhere = mockFindMany.mock.calls[0][0].where;
    expect(callWhere).toEqual({ tenantId: tenantA });
    expect(callWhere).not.toHaveProperty('id');
  });
});

describe('Cenário 7 — SUPER_ADMIN cross-tenant', () => {
  it('SUPER_ADMIN lista producers SEM filtro de tenant', async () => {
    mockFindMany.mockResolvedValue([
      sampleProducer('prod-1', tenantA),
      sampleProducer('prod-2', tenantB),
    ]);
    mockCount.mockResolvedValue(2);

    const result = await ProducerService.list(superAdminCtx, 1, 10);

    expect(result.data).toHaveLength(2);

    const callWhere = mockFindMany.mock.calls[0][0].where;
    expect(callWhere).toEqual({}); // sem filtros
  });
});

describe('Cenário 8 — USER sem producer ainda (recém logado)', () => {
  it('USER (producerId=null) recebe lista vazia (não 403, não 404)', async () => {
    const result = await ProducerService.list(userNewCtx, 1, 10);

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled(); // short-circuit
  });
});

describe('Cenário 11 — getSuppliers respeita isolamento', () => {
  it('USER consegue ver suppliers do PRÓPRIO producer', async () => {
    mockFindFirst.mockResolvedValue(sampleProducer('prod-1')); // getById passa
    mockPSFindMany.mockResolvedValue([
      { supplier: { id: 'sup-1', name: 'Sup A' } },
    ]);

    const result = await ProducerService.getSuppliers(userLinkedCtx, 'prod-1');

    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe('sup-1');

    const callWhere = mockPSFindMany.mock.calls[0][0].where;
    expect(callWhere).toEqual({ producerId: 'prod-1', tenantId: tenantA });
  });

  it('USER recebe 404 ao listar suppliers de producer alheio (short-circuit)', async () => {
    await expect(
      ProducerService.getSuppliers(userLinkedCtx, 'prod-2'),
    ).rejects.toThrow('Produtor não encontrado');

    expect(mockPSFindMany).not.toHaveBeenCalled();
  });
});

describe('Regressão FF-BE-026 — query gerada por USER vs ADMIN', () => {
  it('USER e ADMIN do mesmo tenant geram queries DIFERENTES', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await ProducerService.list(userLinkedCtx, 1, 10);
    const userWhere = mockFindMany.mock.calls[0][0].where;

    mockFindMany.mockClear();
    mockCount.mockClear();
    await ProducerService.list(adminCtx, 1, 10);
    const adminWhere = mockFindMany.mock.calls[0][0].where;

    expect(userWhere).toEqual({ id: 'prod-1', tenantId: tenantA });
    expect(adminWhere).toEqual({ tenantId: tenantA });
    expect(userWhere).not.toEqual(adminWhere);
  });
});
