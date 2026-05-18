/**
 * Performance Monitoring Hook
 *
 * Tracks route transitions and component performance.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { startRouteTransition, endRouteTransition, initWebVitals } from '../lib/performance';

/**
 * Track route transition performance
 */
export function usePerformance(componentName?: string) {
  const location = useLocation();
  const renderStartTime = useRef<number>();

  // Track route transitions
  useEffect(() => {
    startRouteTransition();

    const timer = setTimeout(() => {
      endRouteTransition(location.pathname);
    }, 0);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Track component render time (optional, use sparingly)
  useEffect(() => {
    if (componentName && renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current;

      if (renderTime > 100) {
        // Only log slow renders
        console.debug(`[Performance] ${componentName} rendered in ${renderTime.toFixed(2)}ms`);
      }
    }
  });

  if (componentName) {
    renderStartTime.current = performance.now();
  }
}

/**
 * Initialize performance monitoring on app load
 */
export function initPerformanceMonitoring() {
  if (
    typeof window === 'undefined' ||
    import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING !== 'true'
  ) {
    return;
  }

  // Initialize Web Vitals tracking
  initWebVitals();

  if (import.meta.env.DEV) {
    console.info('[Performance] Monitoring initialized');
  }
}
