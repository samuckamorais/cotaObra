/**
 * Error Logging Utility
 *
 * Centralized error logging with support for:
 * - Console logging in development
 * - Analytics integration in production
 * - Optional Sentry integration
 * - Privacy-first (no PII)
 */

import { trackEvent } from './analytics';

interface ErrorContext {
  userId?: string;
  route?: string;
  userAgent?: string;
  timestamp: string;
  [key: string]: any;
}

interface ErrorData {
  source: string;
  message: string;
  stack?: string;
  context: ErrorContext;
}

/**
 * Log an error with context
 */
export function logError(
  source: string,
  error: Error,
  context?: Partial<ErrorContext>
): void {
  const errorData: ErrorData = {
    source,
    message: error.message,
    stack: error.stack,
    context: {
      ...context,
      timestamp: new Date().toISOString(),
      route: window.location.pathname,
      userAgent: navigator.userAgent,
    },
  };

  // Always log to console in dev
  if (import.meta.env.DEV) {
    console.error('[Error]', errorData);
  } else {
    // In production, log minimal info
    console.error('[Error]', {
      source: errorData.source,
      message: errorData.message,
      route: errorData.context.route,
    });
  }

  // Send to Sentry if configured
  if (import.meta.env.VITE_SENTRY_DSN) {
    // TODO: Integrate Sentry SDK if needed
    // Sentry.captureException(error, { contexts: { custom: errorData.context } });
  }

  // Send to analytics
  if (import.meta.env.VITE_ANALYTICS_ENABLED === 'true') {
    trackEvent('error', {
      error_source: source,
      error_message: error.message.substring(0, 100), // Limit message length
      error_route: errorData.context.route,
    });
  }
}

/**
 * Log a warning message
 */
export function logWarning(message: string, context?: any): void {
  if (import.meta.env.DEV) {
    console.warn('[Warning]', message, context);
  }

  // Optionally track warnings in production
  if (import.meta.env.VITE_ANALYTICS_ENABLED === 'true') {
    trackEvent('warning', {
      message: message.substring(0, 100),
      route: window.location.pathname,
    });
  }
}

/**
 * Log an informational message (dev only)
 */
export function logInfo(message: string, context?: any): void {
  if (import.meta.env.DEV) {
    console.info('[Info]', message, context);
  }
}

/**
 * Log performance metric
 */
export function logPerformance(metric: string, value: number, context?: any): void {
  if (import.meta.env.DEV) {
    console.debug(`[Performance] ${metric}:`, value, context);
  }

  if (import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING === 'true') {
    trackEvent('performance', {
      metric,
      value,
      ...context,
    });
  }
}
