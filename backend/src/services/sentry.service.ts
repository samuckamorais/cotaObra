import { logger } from '../utils/logger';

class SentryService {
  init(): void {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      logger.info('Sentry initialized (stub — install @sentry/node for production)');
    }
  }

  captureException(error: unknown, context?: Record<string, unknown>): void {
    logger.error('[sentry] Exception captured', { error: String(error), ...context });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    logger.info(`[sentry] ${level}: ${message}`);
  }
}

export const sentryService = new SentryService();
