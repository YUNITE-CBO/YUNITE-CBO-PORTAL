/**
 * Provider health monitor.
 *
 * Tracks availability, latency, errors, timeouts, rate limits, and fallback
 * events per provider by reading recent `ai_provider_runs` +
 * `ai_provider_failures`. Snapshots are persisted per investigation so admins
 * can trend health over time (today vs yesterday vs last week).
 *
 * Status semantics:
 *  - healthy:   recent availability >= 95%
 *  - degraded:   recent availability < 95% but > 0
 *  - unavailable: no successful runs in the window and provider not configured
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { ProviderHealthSnapshot, ProviderName } from '../types';
import type { AiProvider } from './provider';

const WINDOW_HOURS = 24;

async function recentStats(provider: ProviderName): Promise<{
  success: number;
  failed: number;
  timeout: number;
  rate_limited: number;
  avgLatency: number | null;
  lastSuccess: string | null;
  lastFailure: string | null;
}> {
  const supabase = await createServiceClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('ai_provider_runs')
    .select('status, latency_ms, started_at')
    .eq('provider', provider)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(500);

  const rows = data ?? [];
  let success = 0, failed = 0, timeout = 0, rateLimited = 0;
  const latencies: number[] = [];
  let lastSuccess: string | null = null;
  let lastFailure: string | null = null;
  for (const r of rows) {
    if (r.status === 'success') {
      success++;
      if (typeof r.latency_ms === 'number') latencies.push(Number(r.latency_ms));
      if (!lastSuccess) lastSuccess = r.started_at;
    } else if (r.status === 'timeout') {
      timeout++;
      if (!lastFailure) lastFailure = r.started_at;
    } else if (r.status === 'rate_limited') {
      rateLimited++;
      if (!lastFailure) lastFailure = r.started_at;
    } else {
      failed++;
      if (!lastFailure) lastFailure = r.started_at;
    }
  }
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  return { success, failed, timeout, rate_limited: rateLimited, avgLatency, lastSuccess, lastFailure };
}

export async function getHealth(
  provider: AiProvider,
): Promise<ProviderHealthSnapshot> {
  const name = provider.name;
  const configured = provider.isConfigured();
  const stats = await recentStats(name);

  const total = stats.success + stats.failed + stats.timeout + stats.rate_limited;
  let availability = 100;
  if (total > 0) availability = (stats.success / total) * 100;

  let status: ProviderHealthSnapshot['status'];
  if (!configured && total === 0) {
    status = 'unavailable';
    availability = 0;
  } else if (availability >= 95) {
    status = 'healthy';
  } else if (stats.success > 0) {
    status = 'degraded';
  } else {
    status = configured ? 'degraded' : 'unavailable';
  }

  // Fallback count = successful runs that were fallbacks in the window.
  const supabase = await createServiceClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const { count: fallbackCount } = await supabase
    .from('ai_provider_runs')
    .select('*', { count: 'exact', head: true })
    .eq('is_fallback', true)
    .eq('status', 'success')
    .gte('started_at', since);

  return {
    provider: name,
    status,
    availability_pct: Math.round(availability * 100) / 100,
    avg_latency_ms: stats.avgLatency ?? undefined,
    success_count: stats.success,
    failure_count: stats.failed,
    timeout_count: stats.timeout,
    rate_limited_count: stats.rate_limited,
    fallback_count: fallbackCount ?? 0,
    last_success_at: stats.lastSuccess ?? undefined,
    last_failure_at: stats.lastFailure ?? undefined,
  };
}

/** Persist a per-investigation health snapshot. */
export async function snapshotHealth(snap: ProviderHealthSnapshot): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('ai_health_snapshots').insert({
    provider: snap.provider,
    status: snap.status,
    availability_pct: snap.availability_pct,
    avg_latency_ms: snap.avg_latency_ms ?? null,
    success_count: snap.success_count,
    failure_count: snap.failure_count,
    timeout_count: snap.timeout_count,
    rate_limited_count: snap.rate_limited_count,
    fallback_count: snap.fallback_count,
    last_success_at: snap.last_success_at ?? null,
    last_failure_at: snap.last_failure_at ?? null,
  });
}
