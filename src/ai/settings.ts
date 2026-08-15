/**
 * AI Intelligence settings resolver.
 *
 * The persistent, admin-toggleable AI settings live in the `settings` table
 * under the 'ai' configuration category (migration 033) — surfaced through
 * the AI Intelligence dashboard and Settings → System Configuration.
 *
 * Precedence for Dual AI Mode (DualModeOption):
 *   1. Explicit per-run selection from the dashboard ('single' | 'dual') —
 *      always wins; never overridden by DB/env.
 *   2. DB setting `ai.dual_mode` ('true' | 'false') — the source of truth
 *      when `dualMode === 'auto'` (the dashboard default).
 *   3. AI_DUAL_MODE env var — deployment-time fallback/override when the DB
 *      setting row is absent (e.g. before migration 033 is applied).
 *
 * `ai.investigations.enabled` / `ai.alerts.critical_enabled` gate the
 * investigation runner and alerting respectively; both default ON so the
 * engine keeps working if the settings rows are missing.
 */

import { configurationService } from '@/lib/services/configuration.service';
import type { DualModeOption } from './types';

const DUAL_MODE_KEY = 'ai.dual_mode';
const INVESTIGATIONS_ENABLED_KEY = 'ai.investigations.enabled';
const ALERTS_CRITICAL_ENABLED_KEY = 'ai.alerts.critical_enabled';

/** True when the value string is an affirmative boolean. */
function isAffirmative(value: string | null | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

/**
 * Resolve the effective DualModeOption for a run.
 *
 * - Explicit 'single'/'dual' selections are passed through unchanged.
 * - 'auto' resolves against the DB `ai.dual_mode` setting, then the
 *   AI_DUAL_MODE env var (so a deploy can still force dual mode if the DB
 *   row is absent). If both are unset, dual mode is OFF (single).
 */
export async function resolveDualMode(dualMode: DualModeOption): Promise<'single' | 'dual'> {
  if (dualMode === 'single') return 'single';
  if (dualMode === 'dual') return 'dual';

  // 'auto' — honor DB setting, then env.
  try {
    const dbValue = await configurationService.getSetting(DUAL_MODE_KEY);
    if (dbValue !== null) {
      return isAffirmative(dbValue) ? 'dual' : 'single';
    }
  } catch {
    // Non-fatal: fall through to env.
  }
  return process.env.AI_DUAL_MODE === 'true' ? 'dual' : 'single';
}

/** Whether the AI investigation engine is enabled (master switch). Default ON. */
export async function isAiInvestigationsEnabled(): Promise<boolean> {
  try {
    const value = await configurationService.getSetting(INVESTIGATIONS_ENABLED_KEY);
    if (value === null) return true; // default ON when unset
    return isAffirmative(value);
  } catch {
    return true;
  }
}

/** Whether CRITICAL-finding alerting is enabled. Default ON. */
export async function isAiCriticalAlertsEnabled(): Promise<boolean> {
  try {
    const value = await configurationService.getSetting(ALERTS_CRITICAL_ENABLED_KEY);
    if (value === null) return true;
    return isAffirmative(value);
  } catch {
    return true;
  }
}

/** Read all AI settings values at once (for the health/settings endpoints). */
export async function readAiSettings(): Promise<Record<string, string>> {
  return configurationService.getMany([
    DUAL_MODE_KEY,
    INVESTIGATIONS_ENABLED_KEY,
    ALERTS_CRITICAL_ENABLED_KEY,
  ]);
}

export const AI_SETTINGS_KEYS = [
  DUAL_MODE_KEY,
  INVESTIGATIONS_ENABLED_KEY,
  ALERTS_CRITICAL_ENABLED_KEY,
] as const;
