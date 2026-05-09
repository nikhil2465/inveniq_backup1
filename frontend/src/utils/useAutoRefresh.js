import { useEffect, useRef } from 'react';

/**
 * Re-runs `callback` when the window regains focus (user switches tabs/apps and comes back)
 * and optionally every `intervalMs` milliseconds. Keeps data fresh without WebSockets.
 *
 * Usage:
 *   const refetch = useCallback(() => { ... }, [deps]);
 *   useAutoRefresh(refetch);
 */
export function useAutoRefresh(callback, intervalMs = 0) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; });

  useEffect(() => {
    const onFocus = () => { if (!document.hidden) saved.current(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    let id;
    if (intervalMs > 0) {
      id = setInterval(() => saved.current(), intervalMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      if (id) clearInterval(id);
    };
  }, [intervalMs]);
}
