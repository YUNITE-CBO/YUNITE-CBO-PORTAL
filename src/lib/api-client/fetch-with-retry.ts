/**
 * Centralized fetch wrapper with cold-start resilience for the YUNITE
 * frontend (Next.js dashboard).
 *
 * All frontend modules (Members, Savings, Loans, Welfare, AI Intelligence, etc.)
 * should use `apiFetch` instead of raw `fetch` so they automatically benefit
 * from retry-with-backoff when the Render Free Tier backend is waking from
 * sleep.
 *
 * Design principles (req. #7, #9):
 * - Only retry errors plausibly caused by temporary backend availability:
 *   network failures, connection reset, timeout, 502, 503, 504.
 * - NEVER retry 4xx (auth, validation, business-rule, duplicate) responses.
 * - For write operations (POST/PUT/PATCH/DELETE), retry ONLY on network-level
 *   failure (the request never reached the server). If the server responded
 *   with 5xx, the request was received — do NOT blindly replay writes
 *   (especially financial transactions) because the server may have already
 *   processed them. The caller is responsible for idempotency on writes.
 * - Dispatch backend availability events so a global UI banner can react.
 */

import { dispatchBackendAvailable, dispatchBackendUnavailable } from './connection-events';

/** HTTP status codes that indicate the backend is temporarily unavailable. */
const RETRYABLE_READ_STATUSES = new Set([502, 503, 504]);

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

export interface ApiFetchOptions extends RequestInit {
  /**
   * Maximum number of retry attempts (default: 4).
   * Total attempts = 1 + retries.
   */
  maxRetries?: number;
  /**
   * Base delay in ms for exponential backoff (default: 1000).
   * Actual delay = base * 2^attempt + jitter.
   */
  baseDelayMs?: number;
}

/** True if the error is a network-level failure (request never completed). */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch throws TypeError on network failure
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return false;
}

/** True if the HTTP status is retryable for GET (read) requests. */
function isRetryableReadStatus(status: number): boolean {
  return RETRYABLE_READ_STATUSES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, baseMs: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  // Add up to 25% jitter to avoid thundering herd.
  const jitter = Math.random() * exp * 0.25;
  return Math.round(exp + jitter);
}

/**
 * Fetch wrapper with automatic cold-start retry.
 *
 * For GET requests: retries on network errors AND 502/503/504.
 * For write requests (POST/PUT/PATCH/DELETE): retries ONLY on network errors
 * (where the request provably never reached the server). Never retries a
 * server response, even 5xx, because the write may have already been applied.
 *
 * On the first retryable failure, dispatches `BACKEND_UNAVAILABLE_EVENT`.
 * On the first successful response after a retry, dispatches
 * `BACKEND_AVAILABLE_EVENT`.
 */
export async function apiFetch(input: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { maxRetries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS, ...init } = options;
  const method = (init.method || 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const maxAttempts = 1 + maxRetries;
  let hadRetryableFailure = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);

      // Success — signal backend is back if we had a prior failure.
      if (hadRetryableFailure) {
        dispatchBackendAvailable();
      }

      // For read requests, retry on 502/503/504.
      if (!isWrite && isRetryableReadStatus(response.status) && attempt < maxRetries) {
        if (!hadRetryableFailure) {
          hadRetryableFailure = true;
          dispatchBackendUnavailable();
        }
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }

      // For write requests, never retry based on a server response.
      return response;
    } catch (err) {
      // Only network-level errors are retryable (request never reached server).
      if (isNetworkError(err) && attempt < maxRetries) {
        if (!hadRetryableFailure) {
          hadRetryableFailure = true;
          dispatchBackendUnavailable();
        }
        await sleep(backoffDelay(attempt, baseDelayMs));
        continue;
      }
      // Non-retryable error or out of attempts — rethrow.
      throw err;
    }
  }

  // Should not reach here, but TypeScript needs a fallback.
  throw new Error('apiFetch: exhausted retries');
}

/**
 * Convenience wrapper that parses JSON and returns the body.
 * Returns { ok, data, response } so callers can check status.
 */
export interface ApiFetchJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  response: Response;
}

export async function apiFetchJson<T>(input: string, options: ApiFetchOptions = {}): Promise<ApiFetchJsonResult<T>> {
  const response = await apiFetch(input, options);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. empty 204).
  }

  const data = body as Record<string, unknown> | null;
  const ok = response.ok && (data?.success !== false);
  const error = typeof data?.error === 'string' ? (data.error as string) : null;

  return {
    ok,
    status: response.status,
    data: (data?.data ?? body) as T | null,
    error,
    response,
  };
}
