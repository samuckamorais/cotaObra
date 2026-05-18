/**
 * FF-BE-026 — Cenários 9 e 10 do script de migração legacy.
 *
 *  9. tenant com 1 USER órfão + 1 Producer órfão → auto-link
 * 10. tenant ambíguo (>1 user OU >1 producer) → log WARN, sem link
 */
jest.mock('../../../src/config/database', () => ({
  prisma: {
    tenant: { findMany: jest.fn() },
    user: { findMany: jest.fn(), update: jest.fn() },
    producer: { findMany: jest.fn() },
    fSMEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';
import { migrate } from '../../../src/scripts/migrate-producer-links';

const mockTenantFindMany = prisma.tenant.findMany as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockProducerFindMany = prisma.producer.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockLoggerInfo = logger.info as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Cenário 9 — Script de migração legacy (match único)', () => {
  it('1 USER órfão + 1 Producer órfão → auto-link via transação', async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: 'tenant-1', name: 'Tenant A' },
    ]);

    // 1ª chamada: unlinkedUsers
    // 2ª chamada: linkedProducerRows (vazio = nenhum producer já linkado)
    mockUserFindMany
      .mockResolvedValueOnce([{ id: 'user-1', email: 'a@a.com', name: 'A' }])
      .mockResolvedValueOnce([]);

    mockProducerFindMany.mockResolvedValue([
      { id: 'prod-1', name: 'Producer A', phone: '+5564999' },
    ]);

    const txUserUpdate = jest.fn();
    const txFSMCreate = jest.fn();
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        user: { update: txUserUpdate },
        fSMEvent: { create: txFSMCreate },
      };
      return cb(tx);
    });

    await migrate();

    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { producerId: 'prod-1' },
    });
    expect(txFSMCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        producerId: 'prod-1',
        eventType: 'producer_auto_linked_to_user_legacy_migration',
      }),
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Auto-linked legacy user-producer',
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        producerId: 'prod-1',
      }),
    );
  });
});

describe('Cenário 10 — Script de migração (tenant ambíguo)', () => {
  it('2 USERs órfãos + 1 Producer órfão → não linka, log WARN', async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: 'tenant-2', name: 'Tenant B' },
    ]);

    mockUserFindMany
      .mockResolvedValueOnce([
        { id: 'user-a', email: 'a@a.com', name: 'A' },
        { id: 'user-b', email: 'b@b.com', name: 'B' },
      ])
      .mockResolvedValueOnce([]);

    mockProducerFindMany.mockResolvedValue([
      { id: 'prod-1', name: 'Producer A', phone: '+5564999' },
    ]);

    await migrate();

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Tenant requires manual review',
      expect.objectContaining({
        tenantId: 'tenant-2',
        unlinkedUsersCount: 2,
        unlinkedProducersCount: 1,
      }),
    );
  });

  it('tenant limpo (0 órfãos) → não linka nem loga WARN', async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: 'tenant-clean', name: 'Tenant Clean' },
    ]);

    mockUserFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockProducerFindMany.mockResolvedValue([]);

    await migrate();

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      'Tenant requires manual review',
      expect.anything(),
    );
  });

  it('idempotência: se producer já está linkado, não aparece como candidato', async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: 'tenant-3', name: 'Tenant C' },
    ]);

    mockUserFindMany
      .mockResolvedValueOnce([{ id: 'user-orphan', email: 'o@o.com', name: 'O' }])
      .mockResolvedValueOnce([{ producerId: 'prod-already-linked' }]);

    // O findMany de producer recebe id: { notIn: ['prod-already-linked'] }
    // e retorna 0 candidatos
    mockProducerFindMany.mockResolvedValue([]);

    await migrate();

    expect(mockTransaction).not.toHaveBeenCalled();
    // user órfão sozinho sem producer candidato → log WARN com 1/0
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Tenant requires manual review',
      expect.objectContaining({
        unlinkedUsersCount: 1,
        unlinkedProducersCount: 0,
      }),
    );

    // Verifica que producer.findMany excluiu o já linkado
    const producerCallArgs = mockProducerFindMany.mock.calls[0][0];
    expect(producerCallArgs.where.id).toEqual({ notIn: ['prod-already-linked'] });
  });
});
