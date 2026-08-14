/**
 * Provider failover + health manager.
 *
 * Default primary = Gemini, secondary = OpenRouter. If the primary is
 * unavailable (fast probe fails / errors / times out / rate-limited),
 * the secondary is invoked immediately WITHOUT waiting indefinitely.
 *
 * IMPORTANT — the timeout distinction:
 *  - The `FAILFAST_TIMEOUT_MS` (~1s, configurable) is used for FAILURE
 *    DETECTION: a fast reachability probe that decides whether to fall over
 *    to the secondary BEFORE starting a (potentially long) generation.
 *  - It does NOT cap the maximum generation duration. A valid generation
 *    that needs more than 1s is allowed to run.
 *
 * Both providers may also be invoked independently (dual mode) so neither
 * sees the other's conclusions. This module handles the single-provider
 * with-failover path; the investigation engine orchestrates dual mode.
 *
 * If both providers fail, the caller falls back to the deterministic engines
 * (handled by the investigation engine — AI is an intelligence layer, not a
 * dependency).
 */

import type { AiProvider } from './provider';
import type {
  InvestigationContext,
  ProviderName,
  ProviderReport,
  ProviderRunResult,
} from '../types';
import { recordProviderFailure } from '../persistence';

const FAILFAST_TIMEOUT_MS = Number(process.env.AI_FAILFAST_TIMEOUT_MS || 1000);

export interface FailoverResult {
  report: ProviderReport;
  run: ProviderRunResult;
  primary_provider: ProviderName;
  fallback_provider: ProviderName;
  fallback_used: boolean;
  fallback_reason?: string;
}

function classifyError(err: unknown): {
  status: ProviderRunResult['status'];
  code?: string;
  message?: string;
} {
  const code = (err as any)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'rate_limited' || message.includes('429')) return { status: 'rate_limited', code, message };
  if (code === 'timeout' || /timeout|abort/i.test(message)) return { status: 'timeout', code, message };
  if (code === 'not_configured') return { status: 'failed', code, message };
  if (code === 'unavailable' || /unavailable|5\d{2}/i.test(message)) return { status: 'failed', code, message };
  return { status: 'failed', code, message };
}

/** Race a promise against a failfast timeout (does not abort the generation). */
function failfastProbe(provider: AiProvider): Promise<boolean> {
  return provider.ping().then((r) => r.ok).catch(() => false);
}

/**
 * Investigate using the primary provider, falling over to the secondary if
 * the primary is unavailable. Returns the (single) successful report + a
 * full run record (including the failure record for the primary if it
 * failed).
 */
export async function investigateWithFailover(
  primary: AiProvider,
  secondary: AiProvider,
  ctx: InvestigationContext,
): Promise<FailoverResult> {
  const primaryProvider = primary.name;
  const fallbackProvider = secondary.name;

  // Fast fail-detection probe for the primary (with ~1s timeout). If the
  // probe does not resolve quickly OR resolves false, fall over immediately.
  let probeOk = false;
  try {
    probeOk = await Promise.race([
      failfastProbe(primary),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), FAILFAST_TIMEOUT_MS)),
    ]);
  } catch {
    probeOk = false;
  }

  if (probeOk) {
    const start = Date.now();
    try {
      const report = await primary.investigate(ctx);
      const run: ProviderRunResult = {
        provider: primary.name,
        role: 'primary',
        status: 'success',
        latency_ms: report.latency_ms ?? Date.now() - start,
        is_fallback: false,
        model: report.model,
      };
      return {
        report,
        run,
        primary_provider: primaryProvider,
        fallback_provider: fallbackProvider,
        fallback_used: false,
      };
    } catch (err) {
      const cls = classifyError(err);
      const failedRun: ProviderRunResult = {
        provider: primary.name,
        role: 'primary',
        status: cls.status,
        latency_ms: Date.now() - start,
        is_fallback: false,
        fallback_reason: cls.status,
        error_code: cls.code,
        error_message: cls.message,
      };
      // best-effort failure log (never throws)
      await recordProviderFailure(primary.name, cls).catch(() => {});
      return fallOverTo(secondary, ctx, failedRun, primaryProvider, fallbackProvider);
    }
  }

  // Primary probe failed fast — record + fall over.
  const failedRun: ProviderRunResult = {
    provider: primary.name,
    role: 'primary',
    status: 'unavailable',
    latency_ms: 0,
    is_fallback: false,
    fallback_reason: 'unavailable',
    error_code: 'probe_failed',
    error_message: 'Primary provider failed reachability probe',
  };
  await recordProviderFailure(primary.name, { status: 'unavailable', code: 'probe_failed', message: 'probe failed' }).catch(() => {});
  return fallOverTo(secondary, ctx, failedRun, primaryProvider, fallbackProvider);
}

async function fallOverTo(
  secondary: AiProvider,
  ctx: InvestigationContext,
  primaryFailed: ProviderRunResult,
  primaryProvider: ProviderName,
  fallbackProvider: ProviderName,
): Promise<FailoverResult> {
  const start = Date.now();
  try {
    const report = await secondary.investigate(ctx);
    const run: ProviderRunResult = {
      provider: secondary.name,
      role: 'fallback',
      status: 'success',
      latency_ms: report.latency_ms ?? Date.now() - start,
      is_fallback: true,
      model: report.model,
    };
    return {
      report,
      run,
      primary_provider: primaryProvider,
      fallback_provider: fallbackProvider,
      fallback_used: true,
      fallback_reason: primaryFailed.status,
    };
  } catch (err) {
    const cls = classifyError(err);
    await recordProviderFailure(secondary.name, cls).catch(() => {});
    // Both failed — rethrow with a combined message; the investigation engine
    // handles the deterministic fallback.
    const both = new Error(
      `Both AI providers failed (primary ${primaryProvider}: ${primaryFailed.error_message}; fallback ${secondary.name}: ${cls.message})`,
    );
    (both as any).code = 'all_providers_failed';
    (both as any).primaryRun = primaryFailed;
    (both as any).secondaryRun = {
      provider: secondary.name,
      role: 'fallback',
      status: cls.status,
      latency_ms: Date.now() - start,
      is_fallback: true,
      error_code: cls.code,
      error_message: cls.message,
    };
    throw both;
  }
}
