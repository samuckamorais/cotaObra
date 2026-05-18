import { useState, useEffect, useRef, useCallback } from 'react';

interface UseDraftSaveOptions<T> {
  key: string;
  data: T;
  debounceMs?: number;
}

interface UseDraftSaveReturn<T> {
  hasDraft: boolean;
  restoreDraft: () => T | null;
  clearDraft: () => void;
  lastSaved: Date | null;
}

/**
 * Hook reutilizável de auto-save em sessionStorage.
 * Salva com debounce e restaura rascunhos ao montar.
 */
export function useDraftSave<T>({ key, data, debounceMs = 2000 }: UseDraftSaveOptions<T>): UseDraftSaveReturn<T> {
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Check for existing draft on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      try {
        JSON.parse(stored);
        setHasDraft(true);
      } catch {
        sessionStorage.removeItem(key);
      }
    }
  }, [key]);

  // Auto-save with debounce
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(data));
        setLastSaved(new Date());
      } catch {
        // sessionStorage full or unavailable
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, data, debounceMs]);

  const restoreDraft = useCallback((): T | null => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        setHasDraft(false);
        return JSON.parse(stored) as T;
      }
    } catch {
      // parse error
    }
    return null;
  }, [key]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(key);
    setHasDraft(false);
    setLastSaved(null);
  }, [key]);

  return { hasDraft, restoreDraft, clearDraft, lastSaved };
}
