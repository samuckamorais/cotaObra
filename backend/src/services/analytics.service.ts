import { logger } from '../utils/logger';

/**
 * CO-9-02 — Analytics service para tracking de eventos de negócio.
 *
 * Quando `POSTHOG_API_KEY` está setado, faz POST direto para
 * `https://app.posthog.com/capture/` (sem dependência de SDK).
 * Caso contrário, fallback para logger com prefix `[analytics]`.
 *
 * Eventos esperados:
 *   - `quote.created`, `quote.dispatched`, `quote.closed`
 *   - `proposal.received`
 *   - `purchase_order.emitted`
 *   - `approval.requested`, `approval.decided`
 *   - `user.invited`, `tenant.signed_up`
 */

interface TrackOptions {
  /** distinctId: idealmente `userId`; fallback `tenantId`. */
  distinctId?: string;
  properties?: Record<string, unknown>;
}

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://app.posthog.com';

class AnalyticsService {
  private get apiKey(): string | undefined {
    return process.env.POSTHOG_API_KEY;
  }

  /**
   * Dispara evento async fire-and-forget. Nunca lança — falhas só logam.
   * Aceita tanto o formato novo (`{ distinctId, properties }`) quanto o
   * legado (objeto flat de properties).
   */
  trackEvent(event: string, optsOrProperties: TrackOptions | Record<string, unknown> = {}): void {
    const isOptsShape =
      typeof optsOrProperties === 'object' &&
      optsOrProperties !== null &&
      ('properties' in optsOrProperties || 'distinctId' in optsOrProperties);

    const opts: TrackOptions = isOptsShape
      ? (optsOrProperties as TrackOptions)
      : { properties: optsOrProperties as Record<string, unknown> };

    const properties = opts.properties ?? {};
    const distinctId =
      opts.distinctId ??
      (properties.userId as string | undefined) ??
      (properties.tenantId as string | undefined) ??
      'anonymous';

    if (!this.apiKey) {
      logger.info(`[analytics] ${event}`, {
        distinctId,
        ...properties,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // PostHog real — POST /capture/ assíncrono
    const payload = {
      api_key: this.apiKey,
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        $lib: 'cotaobra-backend',
        $lib_version: '1.0.0',
      },
      timestamp: new Date().toISOString(),
    };

    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          logger.warn('analytics.posthog_failed', { event, status: res.status });
        }
      })
      .catch((err) => {
        logger.warn('analytics.posthog_error', { event, err: err?.message });
      });
  }
}

export const analyticsService = new AnalyticsService();
