import { logger } from '../utils/logger';

/**
 * CO-9-01 — Wrapper Sentry com fallback para logger.
 *
 * Quando `SENTRY_DSN` está setado, tenta usar `@sentry/node` se instalado;
 * caso contrário grava no logger com `[sentry]` prefix para grep posterior.
 *
 * Para ativar Sentry real em produção:
 *   npm i @sentry/node @sentry/profiling-node
 *   SENTRY_DSN=https://...@sentry.io/...  no env
 */

type SentryEvent = {
  error?: unknown;
  message?: string;
  level?: 'info' | 'warning' | 'error' | 'fatal';
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string; tenantId?: string };
};

class SentryService {
  private inited = false;
  private sdk: any = null;

  init(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;

    try {
      // Lazy require — se @sentry/node não estiver instalado, cai no stub
      // sem quebrar o boot.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sdk = require('@sentry/node');
      this.sdk.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: 0.1,
        release: process.env.GIT_SHA ?? 'dev',
      });
      this.inited = true;
      logger.info('sentry.initialized', { dsn: dsn.replace(/^(.{15}).*$/, '$1…') });
    } catch (err: any) {
      logger.warn('sentry.sdk_unavailable_fallback_logger', { err: err?.message });
    }
  }

  captureException(error: unknown, event: Omit<SentryEvent, 'error'> = {}): void {
    if (this.inited && this.sdk) {
      this.sdk.withScope((scope: any) => {
        if (event.tags) scope.setTags(event.tags);
        if (event.extra) scope.setExtras(event.extra);
        if (event.user) scope.setUser(event.user);
        this.sdk.captureException(error);
      });
      return;
    }
    logger.error('[sentry] exception', {
      error: String(error),
      message: error instanceof Error ? error.message : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      ...event,
    });
  }

  captureMessage(message: string, level: SentryEvent['level'] = 'info'): void {
    if (this.inited && this.sdk) {
      this.sdk.captureMessage(message, level);
      return;
    }
    logger.info(`[sentry] ${level}: ${message}`);
  }
}

export const sentryService = new SentryService();
