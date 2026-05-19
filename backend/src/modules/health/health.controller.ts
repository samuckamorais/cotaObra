import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { env } from '../../config/env';

const router = Router();

interface ServiceStatus {
  status: 'ok' | 'error';
  latencyMs: number;
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

/**
 * GET /health — full status with database, redis, uptime
 */
router.get('/', async (_req: Request, res: Response) => {
  const [database, redisStatus] = await Promise.all([checkDatabase(), checkRedis()]);

  const allOk = database.status === 'ok' && redisStatus.status === 'ok';
  const allDown = database.status === 'error' && redisStatus.status === 'error';
  const status = allOk ? 'ok' : allDown ? 'error' : 'degraded';

  const statusCode = status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    status,
    // CO-9-04 — build info para troubleshooting em pilotos
    version: env.APP_VERSION,
    commit: env.GIT_SHA,
    env: env.NODE_ENV,
    uptime: process.uptime(),
    services: {
      database,
      redis: redisStatus,
    },
    integrations: {
      asaas: !!process.env.ASAAS_API_KEY,
      sentry: !!process.env.SENTRY_DSN,
      posthog: !!process.env.POSTHOG_API_KEY,
      whatsapp: !!process.env.WHATSAPP_PROVIDER,
    },
  });
});

/**
 * GET /health/ready — readiness (can accept traffic)
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const [database, redisStatus] = await Promise.all([checkDatabase(), checkRedis()]);

  const ready = database.status === 'ok' && redisStatus.status === 'ok';

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    services: {
      database: database.status,
      redis: redisStatus.status,
    },
  });
});

/**
 * GET /health/live — liveness (process is alive)
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

export const healthRouter = router;
