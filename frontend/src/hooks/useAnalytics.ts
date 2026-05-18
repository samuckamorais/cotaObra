/**
 * Analytics Hook
 *
 * Provides analytics tracking functionality to components.
 * Auto-tracks page views on route changes.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, trackEvent } from '../lib/analytics';

/**
 * Main analytics hook
 *
 * Automatically tracks page views when route changes.
 * Returns trackEvent function for manual event tracking.
 */
export function useAnalytics() {
  const location = useLocation();

  // Track page views on route change
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return {
    trackEvent,
  };
}

/**
 * Simple page view tracking hook
 *
 * Use when you only need automatic page view tracking
 * without manual event tracking.
 */
export function usePageView() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
}

/**
 * Track component mount/unmount
 *
 * Useful for tracking engagement with specific components.
 */
export function useComponentTracking(componentName: string) {
  useEffect(() => {
    trackEvent('component_viewed', { component: componentName });

    return () => {
      trackEvent('component_unmounted', { component: componentName });
    };
  }, [componentName]);
}
