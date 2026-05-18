/**
 * Performance Monitoring Utility
 *
 * Tracks Web Vitals and performance metrics:
 * - LCP (Largest Contentful Paint)
 * - FID (First Input Delay)
 * - CLS (Cumulative Layout Shift)
 * - Navigation timing
 * - Route transitions
 */

import { trackEvent } from './analytics';
import { logPerformance } from './logger';

type Rating = 'good' | 'needs-improvement' | 'poor';

/**
 * Web Vitals thresholds
 */
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000], // ms
  FID: [100, 300], // ms
  CLS: [0.1, 0.25], // score
  FCP: [1800, 3000], // ms
  TTFB: [800, 1800], // ms
};

/**
 * Get performance rating based on threshold
 */
function getRating(metric: string, value: number): Rating {
  const [good, poor] = THRESHOLDS[metric] || [0, 0];

  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Initialize Web Vitals tracking
 */
export function initWebVitals() {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  // Largest Contentful Paint (LCP)
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };

      const value = lastEntry.startTime;
      const rating = getRating('LCP', value);

      logPerformance('LCP', value, { rating });

      trackEvent('web_vital_lcp', {
        value: Math.round(value),
        rating,
      });
    });

    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (e) {
    // Browser doesn't support LCP
  }

  // First Input Delay (FID)
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();

      entries.forEach((entry: any) => {
        const value = entry.processingStart - entry.startTime;
        const rating = getRating('FID', value);

        logPerformance('FID', value, { rating });

        trackEvent('web_vital_fid', {
          value: Math.round(value),
          rating,
        });
      });
    });

    fidObserver.observe({ entryTypes: ['first-input'] });
  } catch (e) {
    // Browser doesn't support FID
  }

  // Cumulative Layout Shift (CLS)
  let clsValue = 0;
  let clsEntries: any[] = [];

  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as any;

        // Only count layout shifts without recent user input
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
          clsEntries.push(entry);
        }
      }
    });

    clsObserver.observe({ entryTypes: ['layout-shift'] });

    // Report CLS when page becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const rating = getRating('CLS', clsValue);

        logPerformance('CLS', clsValue, { rating, entries: clsEntries.length });

        trackEvent('web_vital_cls', {
          value: parseFloat(clsValue.toFixed(3)),
          rating,
        });
      }
    });
  } catch (e) {
    // Browser doesn't support CLS
  }

  // First Contentful Paint (FCP)
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstEntry = entries[0] as PerformanceEntry & { startTime: number };

      if (firstEntry) {
        const value = firstEntry.startTime;
        const rating = getRating('FCP', value);

        logPerformance('FCP', value, { rating });

        trackEvent('web_vital_fcp', {
          value: Math.round(value),
          rating,
        });
      }
    });

    fcpObserver.observe({ entryTypes: ['paint'] });
  } catch (e) {
    // Browser doesn't support FCP
  }

  // Navigation Timing
  window.addEventListener('load', () => {
    setTimeout(() => {
      const perfData = window.performance.timing;
      const navigationStart = perfData.navigationStart;

      const timing = {
        dns: perfData.domainLookupEnd - perfData.domainLookupStart,
        tcp: perfData.connectEnd - perfData.connectStart,
        ttfb: perfData.responseStart - perfData.requestStart,
        download: perfData.responseEnd - perfData.responseStart,
        domInteractive: perfData.domInteractive - navigationStart,
        domComplete: perfData.domComplete - navigationStart,
        loadComplete: perfData.loadEventEnd - navigationStart,
      };

      logPerformance('navigation_timing', 0, timing);

      trackEvent('navigation_timing', {
        dns: timing.dns,
        tcp: timing.tcp,
        ttfb: timing.ttfb,
        download: timing.download,
        domInteractive: timing.domInteractive,
        domComplete: timing.domComplete,
        loadComplete: timing.loadComplete,
      });
    }, 0);
  });
}

/**
 * Route transition timing
 */
let routeStartTime: number | null = null;

export function startRouteTransition(): void {
  routeStartTime = performance.now();
}

export function endRouteTransition(routeName: string): void {
  if (routeStartTime === null) return;

  const duration = performance.now() - routeStartTime;
  routeStartTime = null;

  logPerformance('route_transition', duration, { route: routeName });

  trackEvent('route_transition', {
    route: routeName,
    duration: Math.round(duration),
  });
}

/**
 * Measure function execution time
 */
export function measureExecution<T>(
  name: string,
  fn: () => T,
  shouldLog = import.meta.env.DEV
): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (shouldLog && duration > 100) {
    logPerformance(name, duration);
  }

  return result;
}

/**
 * Measure async function execution time
 */
export async function measureExecutionAsync<T>(
  name: string,
  fn: () => Promise<T>,
  shouldLog = import.meta.env.DEV
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (shouldLog && duration > 100) {
    logPerformance(name, duration);
  }

  return result;
}
