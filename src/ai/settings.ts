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

/**
 * Full metadata for each AI setting. Used by the settings route to upsert
 * (lazily seed) rows when migration 033 has not yet been applied to the live
 * DB, so the toggle works immediately after deploy without a manual SQL step.
 */
export interface AiSettingMeta {
  key: string;
  category: string;
  description: string;
  data_type: string;
  is_public: boolean;
  display_order: number;
  help_text: string;
}

export const AI_SETTINGS_META: AiSettingMeta[] = [
  {
    key: DUAL_MODE_KEY,
    category: 'ai',
    description: 'Dual AI Mode — run Gemini and OpenRouter as two independent (blind) investigators for full-system and member-verification scopes, then reconcile their findings via the comparison engine. When OFF, only the primary provider runs.',
    data_type: 'boolean',
    is_public: false,
    display_order: 1,
    help_text: 'Turning this ON runs both AI providers per investigation (higher cost/latency, deeper coverage). The dashboard "AI Mode" dropdown still lets you force single/dual per run regardless of this toggle.',
  },
  {
    key: INVESTIGATIONS_ENABLED_KEY,
    category: 'ai',
    description: 'Master switch for the AI Intelligence investigation engine. When OFF, manual and scheduled investigations are blocked (deterministic engines still run; AI providers are skipped).',
    data_type: 'boolean',
    is_public: false,
    display_order: 2,
    help_text: 'Disable to pause all AI provider calls without removing configuration.',
  },
  {
    key: ALERTS_CRITICAL_ENABLED_KEY,
    category: 'ai',
    description: 'Emit internal YUNITE notifications (and best-effort email) to super admins whenever an investigation produces CRITICAL findings.',
    data_type: 'boolean',
    is_public: false,
    display_order: 3,
    help_text: 'No sensitive financial values are sent in email; full evidence stays in the Admin Console.',
  },
];
