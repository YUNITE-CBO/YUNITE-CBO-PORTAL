/**
 * Server-side client for the YUNITE backend API.
 *
 * SECURITY: This module runs ONLY on the server (it is imported exclusively
 * from Next.js Route Handlers / Server Components, never from client code).
 * It reads `YUNITE_API_KEY` from the process environment and attaches it as
 * `Authorization: Bearer ...` to every request. The API key is NEVER
 * serialized to the browser, never placed in URLs, and never logged.
 *
 * The YUNITE backend remains the single source of truth for all data and
 * calculations (balances, shares, loan interest, fine totals, etc.). This
 * client performs NO business-logic computation; it only shapes/normalizes
 * transport concerns (envelope, errors, pagination).
 */

export const API_BASE_URL = (process.env.YUNITE_API_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.YUNITE_API_KEY || '';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  meta?: { request_id?: string; pagination?: Pagination };
}

export interface Pagination {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
}

/** A normalized, user-friendly error thrown by the API client. */
export class YuniteApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'YuniteApiError';
  }
}

function friendly(status: number): string {
  switch (status) {
    case 401:
      return 'Your session could not be verified with YUNITE. Please try again.';
    case 403:
      return 'YUNITE did not authorize this request. Please contact support.';
    case 404:
      return 'The requested record was not found.';
    case 429:
      return 'Too many requests right now. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'YUNITE is unavailable right now. Please try again shortly.';
    default:
      return 'Something went wrong reaching YUNITE. Please try again.';
  }
}

/**
 * Perform an authenticated request to the YUNITE API.
 *
 * Includes cold-start resilience: when the YUNITE backend is waking from
 * Render Free Tier sleep, the request may fail with a network error or a
 * 502/503/504. This function retries with exponential backoff (up to 4
 * attempts) so the member-lookup portal can recover automatically without
 * showing the member a technical error. This portal only performs GET reads
 * — it never mutates member financial data — so retries are always safe.
 *
 * @param path Path beginning with `/api/v1/...`
 * @param init Extra fetch options (method/body are supported but this portal
 *            only performs GET reads — it never mutates member financial data).
 */
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function backoffDelay(attempt: number, baseMs: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * exp * 0.25;
  return Math.round(exp + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiGet<T>(path: string, searchParams?: Record<string, string | undefined>): Promise<T> {
  if (!API_BASE_URL) {
    throw new YuniteApiError('YUNITE API is not configured.', 500, 'config');
  }
  if (!API_KEY) {
    throw new YuniteApiError('YUNITE API key is not configured.', 500, 'config');
  }

  let url = API_BASE_URL + path;
  if (searchParams) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null && v !== '') sp.set(k, v);
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }

  let lastError: YuniteApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
    } catch {
      // Network-level failure — retryable (backend may be cold-starting).
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt, BASE_DELAY_MS));
        continue;
      }
      throw new YuniteApiError(
        'Could not reach the YUNITE server. Please check your connection and try again.',
        0,
        'network',
      );
    }

    let body: ApiEnvelope<T> | undefined;
    try {
      body = (await res.json()) as ApiEnvelope<T>;
    } catch {
      // Bad JSON response.
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt, BASE_DELAY_MS));
        continue;
      }
      throw new YuniteApiError(friendly(res.status), res.status, 'bad_response');
    }

    if (!res.ok || !body?.success) {
      // Retry only on temporary backend unavailability.
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt, BASE_DELAY_MS));
        continue;
      }
      const msg = body?.error?.message || friendly(res.status);
      throw new YuniteApiError(msg, res.status, body?.error?.code, body?.meta?.request_id);
    }

    return body.data as T;
  }

  // Exhausted retries.
  throw lastError || new YuniteApiError('Could not reach the YUNITE server after multiple attempts.', 0, 'network');
}
