/**
 * FF-BE-023 — Isolamento produtor↔fornecedor no painel.
 *
 * Garante que o método list/getById/create/update/delete do SupplierService
 * respeita o vínculo via ProducerSupplier quando o user é um produtor.
 * Os 7 cenários da spec do PO são cobertos abaixo. O cenário 7 (regressão
 * do vazamento) está nomeado explicitamente para facilitar busca futura.
 */
import { SupplierService } from '../../../src/modules/suppliers/supplier.service';
import { prisma } from '../../../src/config/database';
import type { AuthContext } from '../../../src/utils/auth-context';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    supplier: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    producerSupplier: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/utils/phone', () => ({
  normalizePhoneBR: (p: string) => p,
}));

const mockFindMany = prisma.supplier.findMany as jest.Mock;
const mockCount = prisma.supplier.count as jest.Mock;
const mockFindFirst = prisma.supplier.findFirst as jest.Mock;
const mockCreate = prisma.supplier.create as jest.Mock;
const mockDelete = prisma.supplier.delete as jest.Mock;
const mockPSFindUnique = prisma.producerSupplier.findUnique as jest.Mock;
const mockPSFindFirst = prisma.producerSupplier.findFirst as jest.Mock;
const mockPSCreate = prisma.producerSupplier.create as jest.Mock;
const mockPSDelete = prisma.producerSupplier.delete as jest.Mock;

const producerCtx: AuthContext = {
  userId: 'user-prod',
  tenantId: 'tenant-1',
  producerId: 'producer-1',
  role: 'USER',
};

const adminCtx: AuthContext = {
  userId: 'user-admin',
  tenantId: 'tenant-1',
  producerId: null,
  role: 'ADMIN',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe('SupplierService.list — isolamento por produtor', () => {
  it('Cenário 1+7: produtor recebe where com filtro ProducerSupplier (prova que não vaza)', async () => {
    await SupplierService.list(producerCtx, 1, 10);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const where = mockFindMany.mock.calls[0][0].where;

    // Estrutura esperada: AND[ ORtenant, ORownership ]
    expect(where.AND).toBeDefined();
    expect(Array.isArray(where.AND)).toBe(true);

    // O segundo AND deve ter o filtro de ownership via ProducerSupplier
    const ownershipFilter = where.AND[1];
    const hasProducerLink = JSON.stringify(ownershipFilter).includes(
      `"producerId":"${producerCtx.producerId}"`,
    );
    expect(hasProducerLink).toBe(true);
  });

  it('Cenário 2: admin recebe where com OR[tenantId, network] — sem filtro de produtor', async () => {
    await SupplierService.list(adminCtx, 1, 10);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain('producerId');
    expect(JSON.stringify(where)).toContain('"tenantId":"tenant-1"');
  });

  it('produtor com includeNetwork=false NÃO recebe rede e segue exigindo ownership', async () => {
    await SupplierService.list(producerCtx, 1, 10, { includeNetwork: false });

    const where = mockFindMany.mock.calls[0][0].where;
    const serialized = JSON.stringify(where);

    // includeNetwork=false: tenantId:null não aparece nem no filtro de tenant
    // nem no filtro de ownership (não pode aceitar suppliers da rede)
    expect(serialized).not.toContain('"tenantId":null');
    expect(serialized).toContain(`"producerId":"${producerCtx.producerId}"`);
  });
});

describe('SupplierService.getById — produtor não vê supplier de outro', () => {
  it('Cenário 3: getById com produtor inclui filtro de ProducerSupplier', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(SupplierService.getById(producerCtx, 'sup-x')).rejects.toThrow(
      'Fornecedor não encontrado',
    );

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    const where = mockFindFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(`"producerId":"${producerCtx.producerId}"`);
  });

  it('admin enxerga via OR[tenantId, network] (sem filtro de produtor)', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sup-x', tenantId: 'tenant-1' });

    await SupplierService.getById(adminCtx, 'sup-x');

    const where = mockFindFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('producerId');
  });
});

describe('SupplierService.create — auto-vínculo para produtor', () => {
  it('Cenário 4: produtor cria supplier + ProducerSupplier auto-criado', async () => {
    mockFindFirst.mockResolvedValue(null); // sem duplicidade
    mockCreate.mockResolvedValue({ id: 'sup-new', tenantId: 'tenant-1' });
    mockPSFindUnique.mockResolvedValue(null);

    const result = await SupplierService.create(producerCtx, {
      name: 'Novo',
      phone: '+5564999999999',
      isNetworkSupplier: false,
    } as any);

    expect(result.id).toBe('sup-new');
    expect(mockPSCreate).toHaveBeenCalledWith({
      data: {
        producerId: producerCtx.producerId,
        supplierId: 'sup-new',
        tenantId: producerCtx.tenantId,
      },
    });
  });

  it('produtor que tenta cadastrar telefone já existente no tenant → reusa supplier e cria vínculo', async () => {
    const existing = { id: 'sup-existing', tenantId: 'tenant-1' };
    mockFindFirst.mockResolvedValue(existing);
    mockPSFindUnique.mockResolvedValue(null);

    const result = await SupplierService.create(producerCtx, {
      name: 'X',
      phone: '+5564999999999',
      isNetworkSupplier: false,
    } as any);

    expect(result.id).toBe('sup-existing');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPSCreate).toHaveBeenCalled();
  });

  it('admin recebe 409 quando telefone duplica (comportamento legado preservado)', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sup-existing' });

    await expect(
      SupplierService.create(adminCtx, {
        name: 'X',
        phone: '+5564999999999',
        isNetworkSupplier: false,
      } as any),
    ).rejects.toThrow('Telefone já cadastrado');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPSCreate).not.toHaveBeenCalled();
  });

  it('produtor não consegue criar supplier da rede (isNetworkSupplier é ignorado)', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sup-new', tenantId: 'tenant-1' });
    mockPSFindUnique.mockResolvedValue(null);

    await SupplierService.create(producerCtx, {
      name: 'X',
      phone: '+5564999999999',
      isNetworkSupplier: true, // tentativa
    } as any);

    // O supplier criado tem tenantId do produtor, não null (rede)
    const createCallData = mockCreate.mock.calls[0][0].data;
    expect(createCallData.tenantId).toBe('tenant-1');
    expect(createCallData.isNetworkSupplier).toBe(false);
  });
});

describe('SupplierService.delete — semântica por papel', () => {
  it('Cenário 5: produtor deleta → remove só ProducerSupplier (supplier permanece)', async () => {
    mockPSFindFirst.mockResolvedValue({ id: 'link-1' });

    await SupplierService.delete(producerCtx, 'sup-1');

    expect(mockPSDelete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('produtor sem vínculo → 404 (não vaza existência do supplier)', async () => {
    mockPSFindFirst.mockResolvedValue(null);

    await expect(SupplierService.delete(producerCtx, 'sup-de-outro')).rejects.toThrow(
      'Fornecedor não encontrado',
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('Cenário 6: admin deleta o supplier (cascade no PS)', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sup-x', tenantId: 'tenant-1' });

    await SupplierService.delete(adminCtx, 'sup-x');

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'sup-x' } });
    expect(mockPSDelete).not.toHaveBeenCalled();
  });
});

describe('SupplierService.list — Cenário 7: regressão do vazamento', () => {
  /**
   * Esse teste é o "guard" explícito contra a regressão original do bug:
   * antes do fix, dois produtores do MESMO tenant viam a mesma lista de
   * fornecedores. Aqui simulamos o cenário e verificamos que as queries
   * geradas para cada produtor são DIFERENTES (filtros distintos).
   */
  it('produtores diferentes do mesmo tenant geram queries com filtros diferentes', async () => {
    const prodA: AuthContext = { ...producerCtx, producerId: 'prod-A', userId: 'u-A' };
    const prodB: AuthContext = { ...producerCtx, producerId: 'prod-B', userId: 'u-B' };

    await SupplierService.list(prodA, 1, 10);
    const whereA = mockFindMany.mock.calls[0][0].where;

    mockFindMany.mockClear();
    await SupplierService.list(prodB, 1, 10);
    const whereB = mockFindMany.mock.calls[0][0].where;

    const serializedA = JSON.stringify(whereA);
    const serializedB = JSON.stringify(whereB);

    expect(serializedA).toContain('"producerId":"prod-A"');
    expect(serializedB).toContain('"producerId":"prod-B"');
    expect(serializedA).not.toContain('"producerId":"prod-B"');
    expect(serializedB).not.toContain('"producerId":"prod-A"');
  });
});
