/**
 * Analytics Service
 *
 * Lightweight analytics abstraction supporting:
 * - Plausible Analytics (recommended)
 * - Custom endpoint
 * - Privacy-first (no PII tracking)
 * - Event batching for performance
 */

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp?: string;
}

interface AnalyticsConfig {
  enabled: boolean;
  provider: 'plausible' | 'custom' | 'none';
  apiEndpoint?: string;
  siteId?: string;
}

class Analytics {
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private flushInterval?: number;
  private initialized = false;

  constructor() {
    this.config = {
      enabled: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
      provider: (import.meta.env.VITE_ANALYTICS_PROVIDER as any) || 'none',
      apiEndpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT,
      siteId: import.meta.env.VITE_ANALYTICS_SITE_ID,
    };

    if (this.config.enabled && typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private initialize() {
    if (this.initialized) return;

    if (this.config.provider === 'plausible' && this.config.siteId) {
      this.initializePlausible();
    }

    if (this.config.provider === 'custom' && this.config.apiEndpoint) {
      this.startFlushInterval();
    }

    this.initialized = true;
  }

  private initializePlausible() {
    // Inject Plausible script
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = this.config.siteId!;
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);

    if (import.meta.env.DEV) {
      console.info('[Analytics] Plausible initialized for', this.config.siteId);
    }
  }

  private startFlushInterval() {
    // Flush events every 10 seconds
    this.flushInterval = window.setInterval(() => {
      this.flush();
    }, 10000);
  }

  private flush() {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    if (this.config.provider === 'custom' && this.config.apiEndpoint) {
      fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      })
        .then(() => {
          if (import.meta.env.DEV) {
            console.info('[Analytics] Flushed', events.length, 'events');
          }
        })
        .catch((err) => {
          console.warn('[Analytics] Flush failed:', err);
        });
    }
  }

  /**
   * Track a custom event
   */
  public trackEvent(name: string, properties?: Record<string, any>): void {
    if (!this.config.enabled) return;

    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: new Date().toISOString(),
    };

    if (import.meta.env.DEV) {
      console.info('[Analytics] Track:', name, properties);
    }

    if (this.config.provider === 'plausible') {
      // Use Plausible's custom event API
      if (typeof window !== 'undefined' && (window as any).plausible) {
        (window as any).plausible(name, { props: properties });
      }
    } else if (this.config.provider === 'custom') {
      this.eventQueue.push(event);
    }
  }

  /**
   * Track a page view
   */
  public trackPageView(path: string): void {
    if (!this.config.enabled) return;

    if (import.meta.env.DEV) {
      console.info('[Analytics] Page view:', path);
    }

    // Plausible auto-tracks page views, but we can send custom ones
    this.trackEvent('pageview', { path });
  }

  /**
   * Identify user (no-op for privacy)
   */
  public identify(userId: string): void {
    // We don't track user identity for privacy
    // But keep the API for potential future use
    if (import.meta.env.DEV) {
      console.info('[Analytics] Identify (no-op for privacy):', userId);
    }
  }

  /**
   * Clean up
   */
  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

// Singleton instance
export const analytics = new Analytics();

// Export convenience functions
export const trackEvent = (name: string, properties?: Record<string, any>): void => {
  analytics.trackEvent(name, properties);
};

export const trackPageView = (path: string): void => {
  analytics.trackPageView(path);
};

export const identify = (userId: string): void => {
  analytics.identify(userId);
};

// Declare global type for Plausible
declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, any> }) => void;
  }
}
