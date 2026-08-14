'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data hook for BFF GET endpoints. Returns {data, loading, error, reload}.
 * On a 401 (session expired), triggers an optional onUnauthorized callback.
 *
 * `onUnauthorized` is stored in a ref so the fetch effect stays stable and
 * does NOT refetch on every render when callers pass an inline arrow function.
 */
export function useApi<T>(url: string | null, onUnauthorized?: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);

  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  const reload = useCallback(() => {
    if (!url) return;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onUnauthorizedRef.current?.();
          return;
        }
        if (!res.ok || !body?.success) {
          throw new Error(body?.error || 'Unable to load this information right now.');
        }
        setData(body.data as T);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unable to load this information right now.'))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}
