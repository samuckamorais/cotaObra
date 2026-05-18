import request from 'supertest';
import express from 'express';

jest.mock('../../../src/config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    ping: jest.fn(),
  },
}));

import { healthRouter } from '../../../src/modules/health/health.controller';
import { prisma } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockPing = redis.ping as jest.Mock;

const app = express();
app.use('/health', healthRouter);

beforeEach(() => jest.resetAllMocks());

describe('Health Controller', () => {
  describe('GET /health', () => {
    it('retorna status ok quando ambos serviços respondem', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.services.database.status).toBe('ok');
      expect(res.body.services.redis.status).toBe('ok');
    });

    it('inclui uptime e version', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await request(app).get('/health');

      expect(res.body.version).toBe('1.0.0');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('retorna 503 quando serviços falham', async () => {
      mockQueryRaw.mockRejectedValue(new Error('db down'));
      mockPing.mockRejectedValue(new Error('redis down'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
    });

    it('retorna degraded quando apenas um serviço falha', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockRejectedValue(new Error('redis down'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
    });
  });

  describe('GET /health/live', () => {
    it('retorna alive', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
    });
  });
});
