/**
 * YUNITE API — Central request handler
 *
 * Every /api/v1 route is a thin file that calls handleApi() with a
 * domain handler. The wrapper applies, in order:
 *
 *   1. request id generation/tracing
 *   2. endpoint lookup + active check (endpoint override)
 *   3. principal resolution (session or api key)
 *   4. authorization (rbac / client scope)
 *   5. rate limiting
 *   6. handler execution (delegates to existing services/engines)
 *   7. consistent error handling
 *   8. request logging (operational metadata only)
 *
 * Handlers receive an ApiContext and MUST call existing services — they
 * never query/write the database directly for financial operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolvePrincipal, authorize, type ApiPrincipal } from './principal';
import { ApiError, type ApiErrorCode } from './error';
import { errorResponse, success, type PaginationMeta } from './response';
import { getRequestId, attachRequestId } from './request-id';
import { checkRateLimit } from './rate-limit';
import { logRequest } from './logger';
import { findEndpoint, endpointById, type EndpointSpec } from './manifest';

export interface ApiContext {
  request: NextRequest;
  principal: ApiPrincipal;
  /** Path params parsed from the route (e.g. { id: '...' }). */
  params: Record<string, string>;
  /** Parsed JSON body (for POST/PUT/PATCH), or null. */
  body: unknown;
  requestId: string;
}

export type ApiHandler<T = unknown> = (ctx: ApiContext) => Promise<{ data: T; status?: number; pagination?: PaginationMeta }>;

function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}

async function isEndpointActive(endpointId: string): Promise<{ active: boolean; rateLimit?: number }> {
  // Lazy import to avoid loading supabase for public endpoints.
  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('api_endpoint_overrides')
    .select('is_active, rate_limit_per_minute')
    .eq('endpoint_id', endpointId)
    .maybeSingle();
  return { active: data?.is_active ?? true, rateLimit: data?.rate_limit_per_minute ?? undefined };
}

export function createHandler<T>(
  endpointId: string,
  handler: ApiHandler<T>
) {
  return async (
    request: NextRequest,
    routeContext?: { params: Promise<Record<string, string | string[]>> } | Record<string, string | string[]>
  ): Promise<NextResponse> => {
    const requestId = getRequestId(request);
    const start = Date.now();
    const method = request.method;
    const path = request.nextUrl.pathname;

    const spec = endpointById(endpointId);
    if (!spec) {
      const err = ApiError.server('Unknown endpoint');
      const res = attachRequestId(errorResponse(requestId, err), requestId);
      return finalize(request, res, {
        request_id: requestId, client_id: null, client_name: null, user_id: null, user_email: null,
        auth_mode: 'denied', method, path, endpoint_id: endpointId, status_code: 500, duration_ms: 0,
        ip_address: clientIp(request), user_agent: request.headers.get('user-agent'), error_code: err.code,
        is_error: true, is_rate_limited: false,
      }, start);
    }

    let statusCode = 200;
    let errorCode: ApiErrorCode | null = null;
    let authMode: ApiPrincipal['authMode'] | 'denied' = 'anonymous';
    let principal: ApiPrincipal | null = null;

    try {
      // Endpoint active check (override table).
      const override = await isEndpointActive(endpointId);
      if (!override.active) throw ApiError.notFound('Endpoint is disabled');

      // Auth resolution.
      const required = spec.auth !== 'public';
      principal = await resolvePrincipal(request, required);
      authMode = principal.authMode;

      // Authorization (skip for public endpoints).
      if (spec.auth !== 'public') {
        authorize(principal, spec.module, spec.action);
      }

      // Rate limiting (apply override or manifest limit).
      const rl = checkRateLimit(principal, override.rateLimit ?? spec.rateLimitPerMinute);
      if (!rl.allowed) {
        throw ApiError.rateLimited('Rate limit exceeded. Retry after the window resets.');
      }

      // Parse params + body.
      const params = await parseParams(routeContext);
      const body = method !== 'GET' && method !== 'DELETE' ? await parseBody(request) : null;

      // Delegate to the domain handler (which calls existing engines).
      const result = await handler({ request, principal, params, body, requestId });
      statusCode = result.status ?? 200;

      const res = attachRequestId(
        success(requestId, result.data, statusCode, result.pagination),
        requestId
      );
      return finalize(request, res, logEntry(requestId, principal, spec, method, path, statusCode, start, request, null, false), start);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError('server_error', process.env.NODE_ENV === 'production' ? 'Internal server error' : (err instanceof Error ? err.message : String(err)));
      statusCode = apiError.status;
      errorCode = apiError.code;
      if (apiError.code === 'unauthorized' || apiError.code === 'forbidden' || apiError.code === 'client_inactive') {
        authMode = 'denied';
      }

      const res = attachRequestId(errorResponse(requestId, apiError), requestId);
      // Rate-limit responses get a Retry-After header.
      if (apiError.code === 'rate_limited') {
        res.headers.set('Retry-After', '60');
      }
      return finalize(request, res, logEntry(requestId, principal, spec, method, path, statusCode, start, request, errorCode, errorCode === 'rate_limited'), start);
    }
  };

  function logEntry(
    requestId: string,
    principal: ApiPrincipal | null,
    spec: EndpointSpec,
    method: string,
    path: string,
    statusCode: number,
    start: number,
    request: NextRequest,
    errorCode: ApiErrorCode | null,
    isRateLimited: boolean
  ) {
    return {
      request_id: requestId,
      client_id: principal?.clientId ?? null,
      client_name: principal?.clientName ?? null,
      user_id: principal?.userId ?? null,
      user_email: principal?.userEmail ?? null,
      auth_mode: (principal?.authMode ?? 'denied') as ApiPrincipal['authMode'] | 'denied',
      method,
      path,
      endpoint_id: spec.id,
      status_code: statusCode,
      duration_ms: Date.now() - start,
      ip_address: clientIp(request),
      user_agent: request.headers.get('user-agent'),
      error_code: errorCode,
      is_error: statusCode >= 400,
      is_rate_limited: isRateLimited,
    };
  }
}

async function finalize(
  _request: NextRequest,
  response: NextResponse,
  entry: Parameters<typeof logRequest>[0],
  _start: number
): Promise<NextResponse> {
  // Fire-and-forget logging so it never delays the response.
  logRequest(entry);
  return response;
}

async function parseParams(
  routeContext?: { params: Promise<Record<string, string | string[]>> } | Record<string, string | string[]>
): Promise<Record<string, string>> {
  if (!routeContext) return {};
  const raw = 'params' in routeContext && routeContext.params && typeof (routeContext as { params: unknown }).params === 'object'
    ? ((routeContext as { params: Promise<Record<string, string | string[]>> | Record<string, string | string[]> }).params)
    : (routeContext as Record<string, string | string[]>);
  const resolved = raw && typeof (raw as Promise<unknown>).then === 'function'
    ? await (raw as Promise<Record<string, string | string[]>>)
    : (raw as Record<string, string | string[]>);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(resolved)) {
    out[k] = Array.isArray(v) ? v[0] : String(v);
  }
  return out;
}

async function parseBody(request: NextRequest): Promise<unknown> {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : null;
  } catch {
    throw ApiError.validation('Invalid JSON body');
  }
}

/** Validation helper for handlers. */
export function requireFields<T extends Record<string, unknown>>(body: unknown, fields: (keyof T)[]): T {
  if (!body || typeof body !== 'object') {
    throw ApiError.validation('Request body is required');
  }
  const obj = body as Record<string, unknown>;
  const missing: string[] = [];
  for (const f of fields) {
    if (obj[f as string] === undefined || obj[f as string] === null || obj[f as string] === '') {
      missing.push(String(f));
    }
  }
  if (missing.length) {
    throw ApiError.validation(`Missing required fields: ${missing.join(', ')}`);
  }
  return obj as T;
}

export function positiveAmount(amount: unknown, field = 'amount'): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw ApiError.validation(`${field} must be a positive number`);
  }
  return n;
}

export { findEndpoint, endpointById };
