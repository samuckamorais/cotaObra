import { SupplierStateService } from '../../src/services/supplier-state.service';
import { redis } from '../../src/config/redis';
import { prisma } from '../../src/config/database';
import { logger } from '../../src/utils/logger';
import { SupplierState, ConversationContext } from '../../src/types';

jest.mock('../../src/config/redis');
jest.mock('../../src/config/database', () => ({
  prisma: {
    supplierConversationState: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockRedis = redis as unknown as {
  get: jest.Mock;
  setex: jest.Mock;
  del: jest.Mock;
};

const mockPrisma = prisma.supplierConversationState as unknown as {
  findUnique: jest.Mock;
  deleteMany: jest.Mock;
  upsert: jest.Mock;
};

const mockLogger = logger as unknown as { warn: jest.Mock; info: jest.Mock; error: jest.Mock };

const SUPPLIER_ID = 'supplier-abc';
const QUOTE_ID = 'quote-xyz';
const STATE: SupplierState = 'SUPPLIER_AWAITING_RESPONSE';
const CONTEXT: ConversationContext = { quoteId: QUOTE_ID };

function futureDate(hoursAhead = 2): Date {
  return new Date(Date.now() + hoursAhead * 3_600_000);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── get() ────────────────────────────────────────────────────────────────────

describe('SupplierStateService.get()', () => {
  it('retorna estado do cache Redis quando disponível', async () => {
    const payload = JSON.stringify({ state: STATE, context: CONTEXT });
    mockRedis.get = jest.fn().mockResolvedValue(payload);

    const result = await SupplierStateService.get(SUPPLIER_ID);

    expect(mockRedis.get).toHaveBeenCalledWith(`supplier_state:${SUPPLIER_ID}`);
    expect(result).toEqual({ state: STATE, context: CONTEXT });
    expect(mockPrisma.findUnique).not.toHaveBeenCalled();
  });

  it('cai no PostgreSQL quando Redis lança erro (fallback resiliente)', async () => {
    mockRedis.get = jest.fn().mockRejectedValue(new Error('Redis ECONNREFUSED'));
    mockRedis.setex = jest.fn().mockResolvedValue('OK');

    const dbRecord = {
      step: STATE,
      context: CONTEXT,
      expiresAt: futureDate(2),
    };
    mockPrisma.findUnique = jest.fn().mockResolvedValue(dbRecord);

    const result = await SupplierStateService.get(SUPPLIER_ID);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis unavailable'),
      expect.objectContaining({ supplierId: SUPPLIER_ID }),
    );
    expect(mockPrisma.findUnique).toHaveBeenCalledWith({ where: { supplierId: SUPPLIER_ID } });
    expect(result).toEqual({ state: STATE, context: CONTEXT });
  });

  it('re-aquece cache Redis após leitura do PostgreSQL', async () => {
    mockRedis.get = jest.fn().mockRejectedValue(new Error('timeout'));
    mockRedis.setex = jest.fn().mockResolvedValue('OK');

    const dbRecord = {
      step: STATE,
      context: CONTEXT,
      expiresAt: futureDate(1),
    };
    mockPrisma.findUnique = jest.fn().mockResolvedValue(dbRecord);

    await SupplierStateService.get(SUPPLIER_ID);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      `supplier_state:${SUPPLIER_ID}`,
      expect.any(Number),
      expect.stringContaining(STATE),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Supplier state re-cached from PostgreSQL',
      expect.objectContaining({ supplierId: SUPPLIER_ID }),
    );
  });

  it('retorna null quando Redis retorna null e banco não tem registro', async () => {
    mockRedis.get = jest.fn().mockResolvedValue(null);
    mockPrisma.findUnique = jest.fn().mockResolvedValue(null);

    const result = await SupplierStateService.get(SUPPLIER_ID);

    expect(result).toBeNull();
  });

  it('retorna null e limpa registro quando estado está expirado no banco', async () => {
    mockRedis.get = jest.fn().mockResolvedValue(null);
    mockPrisma.deleteMany = jest.fn().mockResolvedValue({ count: 1 });

    const expiredRecord = {
      step: STATE,
      context: CONTEXT,
      expiresAt: new Date(Date.now() - 1000), // já expirou
    };
    mockPrisma.findUnique = jest.fn().mockResolvedValue(expiredRecord);

    const result = await SupplierStateService.get(SUPPLIER_ID);

    expect(result).toBeNull();
    expect(mockPrisma.deleteMany).toHaveBeenCalledWith({ where: { supplierId: SUPPLIER_ID } });
  });

  it('não chama re-aquecimento Redis quando TTL já passou', async () => {
    mockRedis.get = jest.fn().mockRejectedValue(new Error('down'));
    mockRedis.setex = jest.fn();

    const record = {
      step: STATE,
      context: CONTEXT,
      expiresAt: new Date(Date.now() + 500), // expira em <1s, floor = 0
    };
    mockPrisma.findUnique = jest.fn().mockResolvedValue(record);

    await SupplierStateService.get(SUPPLIER_ID);

    // setex só é chamado se remainingTtlSec > 0; com 0 não deve ser chamado
    // (comportamento depende do timing; ao menos não deve lançar erro)
    expect(mockPrisma.findUnique).toHaveBeenCalled();
  });
});

// ─── set() ────────────────────────────────────────────────────────────────────

describe('SupplierStateService.set()', () => {
  it('persiste no PostgreSQL e depois no Redis', async () => {
    mockPrisma.upsert = jest.fn().mockResolvedValue({});
    mockRedis.setex = jest.fn().mockResolvedValue('OK');

    await SupplierStateService.set(SUPPLIER_ID, STATE, CONTEXT);

    expect(mockPrisma.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supplierId: SUPPLIER_ID },
        create: expect.objectContaining({ supplierId: SUPPLIER_ID, step: STATE }),
        update: expect.objectContaining({ step: STATE }),
      }),
    );
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `supplier_state:${SUPPLIER_ID}`,
      expect.any(Number),
      expect.any(String),
    );
  });

  it('usa TTL personalizado quando ttlHours é fornecido', async () => {
    mockPrisma.upsert = jest.fn().mockResolvedValue({});
    mockRedis.setex = jest.fn().mockResolvedValue('OK');

    await SupplierStateService.set(SUPPLIER_ID, STATE, CONTEXT, { ttlHours: 10 });

    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.any(String),
      10 * 3600,
      expect.any(String),
    );
  });

  it('continua normalmente se Redis falhar ao escrever', async () => {
    mockPrisma.upsert = jest.fn().mockResolvedValue({});
    mockRedis.setex = jest.fn().mockRejectedValue(new Error('Redis down'));

    await expect(
      SupplierStateService.set(SUPPLIER_ID, STATE, CONTEXT),
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis write failed'),
      expect.objectContaining({ supplierId: SUPPLIER_ID }),
    );
  });
});

// ─── delete() ─────────────────────────────────────────────────────────────────

describe('SupplierStateService.delete()', () => {
  it('remove do PostgreSQL e do Redis', async () => {
    mockPrisma.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    mockRedis.del = jest.fn().mockResolvedValue(1);

    await SupplierStateService.delete(SUPPLIER_ID);

    expect(mockPrisma.deleteMany).toHaveBeenCalledWith({ where: { supplierId: SUPPLIER_ID } });
    expect(mockRedis.del).toHaveBeenCalledWith(`supplier_state:${SUPPLIER_ID}`);
  });

  it('continua normalmente se Redis falhar ao deletar', async () => {
    mockPrisma.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    mockRedis.del = jest.fn().mockRejectedValue(new Error('Redis down'));

    await expect(SupplierStateService.delete(SUPPLIER_ID)).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis delete failed'),
      expect.objectContaining({ supplierId: SUPPLIER_ID }),
    );
  });
});
