'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data hook for BFF GET endpoints. Returns {data, loading, error, reload}.
 * On a 401 (session expired), triggers an optional onUnauthorized callback.
 *
 * Includes cold-start resilience: when the backend is unavailable (network
 * failure or 502/503/504), automatically retries with exponential backoff.
 * Shows a "Connecting to YUNITE…" state instead of a hard error so members
 * are never told the server is sleeping (req. #10).
 *
 * `onUnauthorized` is stored in a ref so the fetch effect stays stable and
 * does NOT refetch on every render when callers pass an inline arrow function.
 */

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

function backoffDelay(attempt: number, baseMs: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * exp * 0.25;
  return Math.round(exp + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return false;
}

export function useApi<T>(url: string | null, onUnauthorized?: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<boolean>(false);

  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  const reload = useCallback(() => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setReconnecting(false);

    (async () => {
      let lastError: string | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(url);
          const body = await res.json().catch(() => ({}));

          if (res.status === 401) {
            onUnauthorizedRef.current?.();
            return;
          }

          if (!res.ok || !body?.success) {
            // Retry only on plausibly-temporary backend unavailability.
            if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
              setReconnecting(true);
              lastError = body?.error || 'Connecting to YUNITE…';
              await sleep(backoffDelay(attempt, BASE_DELAY_MS));
              continue;
            }
            throw new Error(body?.error || 'Unable to load this information right now.');
          }

          setData(body.data as T);
          return;
        } catch (e: unknown) {
          if (isNetworkError(e) && attempt < MAX_RETRIES) {
            setReconnecting(true);
            lastError = 'Connecting to YUNITE…';
            await sleep(backoffDelay(attempt, BASE_DELAY_MS));
            continue;
          }
          lastError = e instanceof Error ? e.message : 'Unable to load this information right now.';
          break;
        }
      }

      setError(lastError || 'Unable to load this information right now.');
    })()
      .catch(() => setError('Unable to load this information right now.'))
      .finally(() => {
        setLoading(false);
        setReconnecting(false);
      });
  }, [url]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reconnecting, reload };
}
