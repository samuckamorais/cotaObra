import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // Pull distance to trigger refresh (px)
  resistance?: number; // Visual pull resistance factor
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
}: PullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const touchStart = useRef<number | null>(null);
  const scrollTop = useRef<number>(0);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only track if at top of page
      scrollTop.current = window.scrollY || document.documentElement.scrollTop;

      if (scrollTop.current === 0) {
        const touch = e.touches[0];
        if (touch) {
          touchStart.current = touch.clientY;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStart.current === null || scrollTop.current !== 0 || isRefreshing) return;

      const touch = e.touches[0];
      if (!touch) return;

      const currentY = touch.clientY;
      const delta = currentY - touchStart.current;

      // Only pull down
      if (delta > 0) {
        setIsPulling(true);

        // Apply resistance
        const distance = delta / resistance;
        setPullDistance(Math.min(distance, threshold * 1.5));

        // Prevent default scroll if pulling
        if (delta > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling || isRefreshing) {
        touchStart.current = null;
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      // Trigger refresh if pulled enough
      if (pullDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(threshold); // Lock at threshold during refresh

        try {
          await onRefresh();
        } catch (error) {
          console.error('Pull to refresh error:', error);
        } finally {
          setIsRefreshing(false);
          setIsPulling(false);
          setPullDistance(0);
        }
      } else {
        // Snap back
        setIsPulling(false);
        setPullDistance(0);
      }

      touchStart.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isPulling, pullDistance, isRefreshing, threshold, resistance, onRefresh]);

  const shouldTrigger = pullDistance >= threshold;

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    shouldTrigger,
  };
}
