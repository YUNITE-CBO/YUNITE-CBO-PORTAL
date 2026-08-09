/**
 * YUNITE API — Management & observability service
 *
 * Powers the API Management control center: health, overview stats,
 * endpoint registry, request log queries, and abuse detection.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { ENDPOINTS, type EndpointSpec } from './manifest';
import { ApiError } from './error';

export interface ApiOverview {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  version: string;
  endpoint_count: number;
  active_endpoints: number;
  active_clients: number;
  active_keys: number;
  totals: {
    requests_24h: number;
    errors_24h: number;
    rate_limited_24h: number;
    auth_failures_24h: number;
    avg_response_ms_24h: number;
  };
  top_errors: { error_code: string; count: number }[];
  requests_by_status: { status: string; count: number }[];
  recent_requests: unknown[];
}

export interface LogsQuery {
  client_id?: string;
  endpoint_id?: string;
  status_code?: number;
  is_error?: boolean;
  start?: string;
  end?: string;
  request_id?: string;
  page?: number;
  limit?: number;
}

const API_VERSION = 'v1';

export class ApiManagementService {
  async getOverview(): Promise<ApiOverview> {
    const supabase = await createServiceClient();

    // Database health.
    const { error: dbError } = await supabase.from('members').select('id').limit(1);
    const database: 'connected' | 'disconnected' = dbError ? 'disconnected' : 'connected';

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [clients, keys, reqs24h, err24h, rl24h, authFail, avgMs, topErrors, byStatus, recent] = await Promise.all([
      supabase.from('api_clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('api_keys').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('is_error', true),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('is_rate_limited', true),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).in('auth_mode', ['denied', 'anonymous']).in('error_code', ['unauthorized', 'forbidden']),
      supabase.from('api_request_logs').select('duration_ms').gte('created_at', since),
      supabase.from('api_request_logs').select('error_code').gte('created_at', since).not('error_code', 'is', null),
      supabase.from('api_request_logs').select('status_code').gte('created_at', since),
      supabase.from('api_request_logs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    const avgResponseMs = avgMs.data && avgMs.data.length
      ? Math.round(avgMs.data.reduce((s: number, r: { duration_ms: number }) => s + (r.duration_ms || 0), 0) / avgMs.data.length)
      : 0;

    return {
      status: database === 'connected' ? 'healthy' : 'unhealthy',
      database,
      version: API_VERSION,
      endpoint_count: ENDPOINTS.length,
      active_endpoints: ENDPOINTS.length,
      active_clients: clients.count ?? 0,
      active_keys: keys.count ?? 0,
      totals: {
        requests_24h: reqs24h.count ?? 0,
        errors_24h: err24h.count ?? 0,
        rate_limited_24h: rl24h.count ?? 0,
        auth_failures_24h: authFail.count ?? 0,
        avg_response_ms_24h: avgResponseMs,
      },
      top_errors: aggregateField(topErrors.data ?? [], 'error_code')
        .slice(0, 8)
        .map((r) => ({ error_code: r.value, count: r.count })),
      requests_by_status: aggregateField(byStatus.data ?? [], 'status_code')
        .map((r) => ({ status: r.value, count: r.count })),
      recent_requests: recent.data ?? [],
    };
  }

  /** Endpoint registry merged with any DB overrides (active / rate limit). */
  async getEndpoints(): Promise<(EndpointSpec & { is_active: boolean; rate_limit_per_minute: number | null })[]> {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('api_endpoint_overrides').select('endpoint_id, is_active, rate_limit_per_minute');
    const overrides = new Map((data ?? []).map((o: { endpoint_id: string; is_active: boolean; rate_limit_per_minute: number | null }) => [o.endpoint_id, o]));

    return ENDPOINTS.map((e) => {
      const ov = overrides.get(e.id);
      return {
        ...e,
        is_active: ov?.is_active ?? true,
        rate_limit_per_minute: ov?.rate_limit_per_minute ?? e.rateLimitPerMinute ?? null,
      };
    });
  }

  async setEndpointActive(endpointId: string, isActive: boolean, rateLimitPerMinute: number | null, updatedBy?: string): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('api_endpoint_overrides')
      .upsert({
        endpoint_id: endpointId,
        is_active: isActive,
        rate_limit_per_minute: rateLimitPerMinute,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      });
    if (error) throw ApiError.server(error.message);
  }

  async getMetrics(hours = 24) {
    const supabase = await createServiceClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const [reqs, errs, rl, byStatus, avgMs] = await Promise.all([
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('is_error', true),
      supabase.from('api_request_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('is_rate_limited', true),
      supabase.from('api_request_logs').select('status_code').gte('created_at', since),
      supabase.from('api_request_logs').select('duration_ms').gte('created_at', since),
    ]);
    const avgResponseMs = avgMs.data && avgMs.data.length
      ? Math.round(avgMs.data.reduce((s: number, r: { duration_ms: number }) => s + (r.duration_ms || 0), 0) / avgMs.data.length)
      : 0;
    return {
      window_hours: hours,
      requests: reqs.count ?? 0,
      errors: errs.count ?? 0,
      rate_limited: rl.count ?? 0,
      avg_response_ms: avgResponseMs,
      requests_by_status: aggregateField(byStatus.data ?? [], 'status_code'),
    };
  }

  async getLogs(q: LogsQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = await createServiceClient();
    let query = supabase.from('api_request_logs').select('*', { count: 'exact' });
    if (q.client_id) query = query.eq('client_id', q.client_id);
    if (q.endpoint_id) query = query.eq('endpoint_id', q.endpoint_id);
    if (q.status_code) query = query.eq('status_code', q.status_code);
    if (q.is_error !== undefined) query = query.eq('is_error', q.is_error);
    if (q.start) query = query.gte('created_at', q.start);
    if (q.end) query = query.lte('created_at', q.end);
    if (q.request_id) query = query.eq('request_id', q.request_id);

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
    if (error) throw ApiError.server(error.message);

    return {
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) || 0 },
    };
  }
}

function aggregateField(rows: Record<string, unknown>[], field: string): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = String(r[field] ?? 'unknown');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count }));
}

export const apiManagementService = new ApiManagementService();
