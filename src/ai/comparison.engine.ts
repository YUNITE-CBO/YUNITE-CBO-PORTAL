/**
 * AI COMPARISON ENGINE.
 *
 * Runs AFTER both independent investigations complete. Reconciles two
 * provider reports (and the deterministic report) into:
 *  - AGREEMENTS       (both providers found the same thing)
 *  - GEMINI ONLY      / OPENROUTER ONLY
 *  - DISAGREEMENTS    (conflicting conclusions)
 *  - VERIFIED         (confirmed by deterministic DB/API checks)
 *  - HUMAN REVIEW     (disputed or unverified)
 *
 * Deepened (req. #10): findings are now matched by a deep key that includes
 * module + location (database table/field, backend route, frontend component,
 * member) so two providers reporting the SAME field at the SAME location are
 * correlated even when their wording differs entirely. Disagreements are
 * classified by type (severity / root-cause / evidence / value difference).
 * Disputed findings are marked `requires_verification` — never automatically
 * promoted to fact.
 */

import type { ComparisonResult, Finding } from './types';

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fingerprint(f: Finding): string {
  const parts = [f.module ?? '', f.category ?? '', normalizeTitle(f.title)];
  return parts.join('|');
}

/**
 * Deep location key (req. #10): two findings match if they point at the same
 * module + database table/field + backend route + frontend component + member.
 * This correlates "Savings balance mismatch" (Gemini) with "Stored account
 * balance not synchronized with ledger" (OpenRouter) when both point at
 * accounts.savings_balance for the same member.
 */
function locationKey(f: Finding): string {
  const loc = f.location;
  return [
    f.module ?? '_',
    loc?.database?.table ?? '_',
    loc?.database?.field ?? '_',
    loc?.backend?.route ?? '_',
    loc?.frontend?.component ?? '_',
    loc?.frontend?.field ?? '_',
    loc?.member_number ?? loc?.member_id ?? '_',
  ].join('::');
}

function matchKey(f: Finding): string {
  // Prefer the deep location key; fall back to module+category.
  const lk = locationKey(f);
  if (!lk.endsWith('_::_::_::_::_::_::_')) return lk;
  return `${f.module ?? '_'}::${f.category ?? '_'}`;
}

function severityRank(s: Finding['severity']): number {
  const ranks: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return ranks[s] ?? 0;
}

function bestOf(a: Finding, b: Finding): Finding {
  // Prefer the higher-severity, higher-confidence one when merging agreements.
  const sa = severityRank(a.severity);
  const sb = severityRank(b.severity);
  if (sa !== sb) return sa > sb ? a : b;
  const confRanks: Record<string, number> = { confirmed: 4, high: 3, medium: 2, low: 1 };
  const ca = confRanks[a.confidence] ?? 0;
  const cb = confRanks[b.confidence] ?? 0;
  return ca >= cb ? a : b;
}

function similarity(a: Finding, b: Finding): boolean {
  // Deep location match (req. #10): same module + DB table/field + member.
  if (matchKey(a) === matchKey(b)) return true;
  // Fallback: fingerprint (module + category + normalized title).
  if (fingerprint(a) === fingerprint(b)) return true;
  // Token overlap on title as a last resort.
  const taArr = normalizeTitle(a.title).split(' ').filter((w) => w.length > 3);
  const tbArr = normalizeTitle(b.title).split(' ').filter((w) => w.length > 3);
  const ta = new Set(taArr);
  const tb = new Set(tbArr);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const w of taArr) if (tb.has(w)) shared++;
  return shared >= Math.max(2, Math.min(ta.size, tb.size) - 1);
}

/** Classify WHY two matched findings disagree (req. #10). */
function disagreementReason(g: Finding, o: Finding): string {
  const reasons: string[] = [];
  if (severityRank(g.severity) !== severityRank(o.severity)) {
    reasons.push(`Severity differs: Gemini=${g.severity}, OpenRouter=${o.severity}`);
  }
  if (g.root_cause && o.root_cause && normalizeTitle(g.root_cause) !== normalizeTitle(o.root_cause)) {
    reasons.push(`Root cause differs: Gemini="${g.root_cause.slice(0, 60)}" vs OpenRouter="${o.root_cause.slice(0, 60)}"`);
  }
  if (g.difference && o.difference && g.difference !== o.difference) {
    reasons.push(`Value difference differs: Gemini=${g.difference} vs OpenRouter=${o.difference}`);
  }
  if (g.expected_value && o.expected_value && g.expected_value !== o.expected_value) {
    reasons.push(`Expected value differs: Gemini=${g.expected_value} vs OpenRouter=${o.expected_value}`);
  }
  return reasons.length ? reasons.join('; ') : 'Conclusions diverge';
}

export function compareReports(
  investigationId: string,
  reportIds: { gemini?: string; openrouter?: string; deterministic?: string },
  gemini: Finding[],
  openrouter: Finding[],
  deterministic: Finding[],
): ComparisonResult {
  const agreements: Finding[] = [];
  const geminiOnly: Finding[] = [];
  const openrouterOnly: Finding[] = [];
  const disagreements: { gemini: Finding; openrouter: Finding; reason: string }[] = [];
  const humanReview: Finding[] = [];

  // Index deterministic findings for verification (by both deep key + fingerprint).
  const detByDeepKey = new Map<string, Finding[]>();
  for (const d of deterministic) {
    const k = matchKey(d);
    detByDeepKey.set(k, [...(detByDeepKey.get(k) ?? []), d]);
  }
  const detFingerprints = new Set<string>(deterministic.map(fingerprint));
  const detHas = (f: Finding) =>
    (detByDeepKey.has(matchKey(f))) || detFingerprints.has(fingerprint(f));

  const matchedOpen = new Set<number>();
  for (let gi = 0; gi < gemini.length; gi++) {
    const g = gemini[gi];
    let foundMatch = -1;
    for (let oi = 0; oi < openrouter.length; oi++) {
      if (matchedOpen.has(oi)) continue;
      if (similarity(g, openrouter[oi])) { foundMatch = oi; break; }
    }
    if (foundMatch >= 0) {
      matchedOpen.add(foundMatch);
      const o = openrouter[foundMatch];
      // Agreement vs disagreement.
      const sevClose = Math.abs(severityRank(g.severity) - severityRank(o.severity)) <= 1;
      const sameDiff = !g.difference || !o.difference || g.difference === o.difference;
      if (sevClose && sameDiff) {
        const merged: Finding = {
          ...bestOf(g, o),
          sources: ['gemini', 'openrouter'],
          verification_status: detHas(g) ? 'confirmed' : 'requires_verification',
          human_review_required: false,
          is_verified: detHas(g),
        };
        agreements.push(merged);
      } else {
        // Disagreement (severity or value difference) -> human review.
        const reason = disagreementReason(g, o);
        disagreements.push({
          gemini: { ...g, verification_status: 'requires_verification' },
          openrouter: { ...o, verification_status: 'requires_verification' },
          reason,
        });
        humanReview.push({ ...bestOf(g, o), verification_status: 'requires_verification', human_review_required: true });
      }
    } else {
      // Gemini-only.
      geminiOnly.push({ ...g, verification_status: detHas(g) ? 'verified' : 'requires_verification', is_verified: detHas(g) });
      if (g.confidence !== 'confirmed') humanReview.push({ ...g, verification_status: 'requires_verification', human_review_required: true });
    }
  }
  for (let oi = 0; oi < openrouter.length; oi++) {
    if (matchedOpen.has(oi)) continue;
    const o = openrouter[oi];
    openrouterOnly.push({ ...o, verification_status: detHas(o) ? 'verified' : 'requires_verification', is_verified: detHas(o) });
    if (o.confidence !== 'confirmed') humanReview.push({ ...o, verification_status: 'requires_verification', human_review_required: true });
  }

  // Verified findings = deterministic findings that align with at least one
  // provider OR were independently confirmed by the deterministic engine.
  const verifiedFindings: Finding[] = [];
  for (const d of deterministic) {
    const providerHits = [...gemini, ...openrouter].some((p) => similarity(d, p));
    verifiedFindings.push({
      ...d,
      verification_status: 'confirmed',
      sources: providerHits ? ['deterministic', 'gemini', 'openrouter'].filter((s, i) => i === 0 || providerHits) : ['deterministic'],
      is_verified: true,
    });
  }

  const counts = {
    agreements: agreements.length,
    gemini_only: geminiOnly.length,
    openrouter_only: openrouterOnly.length,
    disagreements: disagreements.length,
    verified: verifiedFindings.length,
    human_review: humanReview.length,
  };

  const comparison_json = {
    agreements: agreements.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity, sources: f.sources, location: f.location })),
    gemini_only: geminiOnly.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity, location: f.location })),
    openrouter_only: openrouterOnly.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity, location: f.location })),
    disagreements: disagreements.map((d) => ({
      gemini: { code: d.gemini.finding_code, title: d.gemini.title, severity: d.gemini.severity, root_cause: d.gemini.root_cause, difference: d.gemini.difference },
      openrouter: { code: d.openrouter.finding_code, title: d.openrouter.title, severity: d.openrouter.severity, root_cause: d.openrouter.root_cause, difference: d.openrouter.difference },
      reason: d.reason,
    })),
    verified: verifiedFindings.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity })),
    human_review: humanReview.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity })),
    counts,
  };

  return {
    investigation_id: investigationId,
    gemini_report_id: reportIds.gemini,
    openrouter_report_id: reportIds.openrouter,
    deterministic_report_id: reportIds.deterministic,
    agreements,
    gemini_only: geminiOnly,
    openrouter_only: openrouterOnly,
    disagreements,
    verified_findings: verifiedFindings,
    human_review: humanReview,
    counts,
    comparison_json,
  };
}
