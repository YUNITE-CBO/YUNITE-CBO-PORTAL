/**
 * AI Provider abstraction.
 *
 * The rest of the AI engine depends ONLY on this interface, never on a
 * concrete provider. Both Gemini and OpenRouter implement it. The
 * investigation/comparison/report engines call `investigate()` with the
 * SAME context and the SAME controlled tool payload, so neither provider
 * can see the other's conclusions before producing its independent report.
 *
 * Security: providers receive only sanitized context (the tools_payload is
 * already PII-filtered by the tool layer). Providers never receive DB
 * credentials, service-role keys, or raw PII. They communicate over HTTPS
 * with their own API key, read server-side only.
 */

import type { InvestigationContext, ProviderName, ProviderReport, ProviderRunResult } from '../types';

export interface AiProvider {
  readonly name: ProviderName;
  /** Whether the provider is configured (has a key + model). */
  isConfigured(): boolean;
  /**
   * Investigate the given context and produce an independent structured
   * report. This is a long-running generation; the failover timeout that
   * detects provider UNAVAILABILITY is handled by the failover manager,
   * NOT by truncating a valid generation.
   */
  investigate(ctx: InvestigationContext): Promise<ProviderReport>;
  /** Lightweight reachability probe used for health checks (fast). */
  ping(): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}

export type { ProviderName, ProviderReport, ProviderRunResult };
