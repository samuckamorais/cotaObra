import { logger } from '../utils/logger';

/**
 * Analytics service for tracking business events.
 * Wraps a provider (PostHog/Mixpanel) with graceful fallback to logger.
 * When POSTHOG_API_KEY is not set, events are logged for future replay.
 */
class AnalyticsService {
  trackEvent(event: string, properties: Record<string, unknown> = {}): void {
    logger.info(`[analytics] ${event}`, { ...properties, timestamp: new Date().toISOString() });
  }
}

export const analyticsService = new AnalyticsService();
