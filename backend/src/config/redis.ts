import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

// Singleton pattern para cliente Redis
class RedisClient {
  private static instance: Redis;

  private constructor() {}

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError(err) {
          const targetErrors = ['READONLY', 'ECONNREFUSED'];
          if (targetErrors.some((targetError) => err.message.includes(targetError))) {
            return true;
          }
          return false;
        },
      });

      RedisClient.instance.on('connect', () => {
        logger.info('✅ Redis connected');
      });

      RedisClient.instance.on('error', (err) => {
        logger.error('❌ Redis error:', err);
      });

      RedisClient.instance.on('close', () => {
        logger.warn('⚠️ Redis connection closed');
      });
    }
    return RedisClient.instance;
  }

  public static async disconnect(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
    }
  }
}

export const redis = RedisClient.getInstance();
export default RedisClient;
