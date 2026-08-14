/**
 * MODULE HEALTH MAP ENGINE (req. #20, #21).
 *
 * Aggregates findings into a per-module health map so the admin console can
 * show a clickable visual:
 *
 *   MODULE              STATUS
 *   Members             ✓ HEALTHY
 *   Savings             ✕ INCONSISTENT
 *   Loans               ⚠ WARNING
 *   ...
 *
 * Clicking a module opens its detailed findings (the drill-down view in the
 * UI reads the `finding_codes` array and the same findings list).
 *
 * Status semantics:
 *  - inconsistent: at least one critical/high finding in this module
 *  - warning: only medium/low findings
 *  - healthy: no findings (or only info)
 *
 * This is a pure function over a findings array — no DB access — so it can
 * run over deterministic findings, AI findings, or the merged set.
 */

import type { Finding, ModuleHealthEntry } from '../types';

/** The canonical module list shown in the health map (req. #7, #20). */
export const MODULE_HEALTH_ORDER = [
  'members', 'compliance', 'savings', 'shares', 'contributions',
  'welfare', 'fines', 'loans', 'repayments', 'donations', 'grants',
  'unity_fund', 'statements', 'meetings', 'documents', 'users',
  'settings', 'audit_logs', 'notifications', 'member_lookup', 'api', 'transactions',
] as const;

export function buildModuleHealthMap(findings: Finding[]): ModuleHealthEntry[] {
  const byModule = new Map<string, Finding[]>();

  for (const f of findings) {
    const mod = normalizeModule(f.module ?? f.location?.module);
    if (!mod) continue;
    const arr = byModule.get(mod) ?? [];
    arr.push(f);
    byModule.set(mod, arr);
  }

  const entries: ModuleHealthEntry[] = [];

  // Always include every canonical module (even healthy ones — req. #20).
  for (const mod of MODULE_HEALTH_ORDER) {
    const modFindings = byModule.get(mod) ?? [];
    entries.push(buildEntry(mod, modFindings));
  }

  // Include any modules found in findings that aren't in the canonical list.
  for (const mod of Array.from(byModule.keys())) {
    if (!MODULE_HEALTH_ORDER.includes(mod as any)) {
      entries.push(buildEntry(mod, byModule.get(mod) ?? []));
    }
  }

  return entries.sort((a, b) => {
    // Sort: inconsistent first, then warning, then healthy.
    const order = { inconsistent: 0, warning: 1, healthy: 2 } as const;
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.findings_count - a.findings_count;
  });
}

function buildEntry(module: string, findings: Finding[]): ModuleHealthEntry {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;

  let status: ModuleHealthEntry['status'];
  if (critical > 0 || high > 0) status = 'inconsistent';
  else if (findings.length > 0) status = 'warning';
  else status = 'healthy';

  // Aggregate affected members/records.
  const memberSet = new Set<string>();
  const recordSet = new Set<string>();
  for (const f of findings) {
    if (f.location?.member_number) memberSet.add(f.location.member_number);
    else if (f.location?.member_id) memberSet.add(f.location.member_id);
    for (const r of f.affected_records ?? []) recordSet.add(r);
  }

  // Sum numeric differences for financial findings.
  let totalDiff = 0;
  let hasDiff = false;
  for (const f of findings) {
    if (f.difference) {
      const n = parseFloat(f.difference.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) { totalDiff += Math.abs(n); hasDiff = true; }
    }
  }

  return {
    module,
    status,
    findings_count: findings.length,
    critical_count: critical,
    high_count: high,
    affected_members: memberSet.size || undefined,
    affected_records: recordSet.size || undefined,
    total_difference: hasDiff ? `KES ${Math.round(totalDiff * 100) / 100}` : undefined,
    finding_codes: findings.map((f) => f.finding_code),
  };
}

/** Normalize module names so the health map groups consistently. */
function normalizeModule(mod: string | undefined): string | undefined {
  if (!mod) return undefined;
  const m = mod.toLowerCase().trim();
  // Map common aliases to canonical names.
  const aliases: Record<string, string> = {
    'member': 'members',
    'member_verification': 'member_lookup',
    'member-lookup': 'member_lookup',
    'loan': 'loans',
    'loan_repayments': 'repayments',
    'repayment': 'repayments',
    'fine': 'fines',
    'contribution': 'contributions',
    'campaign': 'contributions',
    'account': 'accounts',
    'accounts': 'savings',
    'transaction': 'transactions',
    'document': 'documents',
    'compliance_records': 'compliance',
    'user': 'users',
    'setting': 'settings',
    'audit_log': 'audit_logs',
    'notification': 'notifications',
    'meeting': 'meetings',
    'welfare_fund': 'welfare',
    'unity': 'unity_fund',
    'grant': 'grants',
    'donation': 'donations',
    'statement': 'statements',
  };
  return aliases[m] ?? m;
}
