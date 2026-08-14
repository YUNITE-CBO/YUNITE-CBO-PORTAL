/**
 * Read-only API investigation tools.
 *
 * These tools inspect the existing backend API architecture from the
 * endpoint manifest (single source of truth) and exercise SAFE GET/read
 * operations where possible. They NEVER make destructive API calls.
 *
 * The AI receives the API surface metadata (routes, methods, auth, RBAC,
 * response structure) plus a sampled, sanitized snapshot of API response
 * shapes — never credentials.
 */

import { ENDPOINTS, AVAILABLE_SCOPES } from '@/lib/api/manifest';
import { createServiceClient } from '@/lib/supabase/server';

export interface RouteInspection {
  endpoint_id: string;
  method: string;
  path: string;
  module: string;
  action: string;
  summary: string;
  auth: string;
  min_role?: string;
  financial: boolean;
  rate_limit_per_minute?: number;
}

/** Inspect every registered API route (read-only, from the manifest). */
export function getApiRoutes(): RouteInspection[] {
  return ENDPOINTS.map((e) => ({
    endpoint_id: e.id,
    method: e.method,
    path: e.path,
    module: e.module,
    action: e.action,
    summary: e.summary,
    auth: e.auth,
    min_role: e.minRole,
    financial: Boolean(e.financial),
    rate_limit_per_minute: e.rateLimitPerMinute,
  }));
}

/** Detect structural anomalies across the manifest (unused/duplicate/missing). */
export function inspectApiSurface(): Record<string, unknown> {
  const routes = getApiRoutes();
  const byMethodPath = new Map<string, RouteInspection[]>();
  for (const r of routes) {
    const k = `${r.method} ${r.path}`;
    byMethodPath.set(k, [...(byMethodPath.get(k) ?? []), r]);
  }
  const dupKeys: string[] = [];
  byMethodPath.forEach((v, k) => { if (v.length > 1) dupKeys.push(k); });

  const byId = new Map<string, RouteInspection[]>();
  for (const r of routes) byId.set(r.endpoint_id, [...(byId.get(r.endpoint_id) ?? []), r]);
  const dupIds: string[] = [];
  byId.forEach((v, k) => { if (v.length > 1) dupIds.push(k); });

  const modules = Array.from(new Set(routes.map((r) => r.module)));
  const noMinRole = routes.filter((r) => r.auth === 'required' && !r.min_role).map((r) => r.endpoint_id);
  const financialLowRole = routes.filter((r) => r.financial && r.min_role && r.min_role !== 'admin' && r.min_role !== 'super_admin' && r.min_role !== 'staff').map((r) => r.endpoint_id);

  return {
    total_routes: routes.length,
    modules,
    duplicate_method_paths: dupKeys,
    duplicate_ids: dupIds,
    required_no_min_role: noMinRole,
    financial_endpoints_with_low_role: financialLowRole,
    grantable_scopes_count: AVAILABLE_SCOPES.length,
    grantable_scopes: AVAILABLE_SCOPES.map((s) => s.label),
  };
}

/** Response schema reference (from the gateway's documented envelope). */
export function getApiResponseSchema(): Record<string, unknown> {
  return {
    success_envelope: {
      success: true,
      data: 'T (endpoint-specific)',
      meta: { request_id: 'string', pagination: { page: 'number', limit: 'number', total: 'number', total_pages: 'number' } },
    },
    error_envelope: {
      success: false,
      error: {
        code: 'validation_error | unauthorized | forbidden | not_found | conflict | rate_limited | method_not_allowed | client_inactive | endpoint_disabled | server_error | service_unavailable',
        message: 'string',
      },
      meta: { request_id: 'string' },
    },
    error_codes: [
      'validation_error', 'unauthorized', 'forbidden', 'not_found', 'conflict',
      'rate_limited', 'method_not_allowed', 'client_inactive', 'endpoint_disabled',
      'server_error', 'service_unavailable',
    ],
  };
}

/** API definition = routes + scopes + response schema. */
export function getApiDefinition(): Record<string, unknown> {
  return {
    routes: getApiRoutes(),
    surface: inspectApiSurface(),
    response_schema: getApiResponseSchema(),
    auth_modes: ['session (cookie JWT)', 'api_key (Bearer yk_...)'],
    rbac: 'session uses manifest minRole hierarchy; super_admin bypasses; api_key uses explicit module.action scopes',
  };
}

/** Sample gateway request logs (read-only) for activity patterns. */
export async function getApiActivity(limit = 50): Promise<Record<string, unknown>[]> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('api_request_logs')
    .select('method, path, endpoint_id, status_code, duration_ms, auth_mode, is_error, is_rate_limited, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Record<string, unknown>[];
}
