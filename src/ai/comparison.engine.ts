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
 * Findings are matched by a normalized key (module + category + a normalized
 * title token) so semantically equivalent findings from two providers are
 * correlated even when their wording differs. Disputed findings are marked
 * `requires_verification` — never automatically promoted to fact.
 */

import type { ComparisonResult, Finding, Severity } from './types';

interface MatchKey {
  key: string;
  module?: string;
  category?: string;
  fingerprint: string;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fingerprint(f: Finding): string {
  const parts = [f.module ?? '', f.category ?? '', normalizeTitle(f.title)];
  return parts.join('|');
}

function matchKey(f: Finding): string {
  // Group by module+category primarily; title fingerprint breaks ties.
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
  // Same module+category, OR title fingerprint token overlap.
  if (fingerprint(a) === fingerprint(b)) return true;
  const taArr = normalizeTitle(a.title).split(' ').filter((w) => w.length > 3);
  const tbArr = normalizeTitle(b.title).split(' ').filter((w) => w.length > 3);
  const ta = new Set(taArr);
  const tb = new Set(tbArr);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const w of taArr) if (tb.has(w)) shared++;
  return shared >= Math.max(2, Math.min(ta.size, tb.size) - 1);
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

  // Index deterministic findings for verification.
  const detByKey = new Map<string, Finding[]>();
  for (const d of deterministic) {
    const k = matchKey(d);
    detByKey.set(k, [...(detByKey.get(k) ?? []), d]);
  }
  const detFingerprints = new Set<string>(deterministic.map(fingerprint));
  const detHas = (f: Finding) => detFingerprints.has(fingerprint(f));

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
      if (severityRank(g.severity) === severityRank(o.severity) || Math.abs(severityRank(g.severity) - severityRank(o.severity)) <= 1) {
        const merged: Finding = {
          ...bestOf(g, o),
          sources: ['gemini', 'openrouter'],
          verification_status: detHas(g) ? 'confirmed' : 'requires_verification',
          human_review_required: false,
        };
        agreements.push(merged);
      } else {
        // Severity disagreement -> human review.
        disagreements.push({
          gemini: { ...g, verification_status: 'requires_verification' },
          openrouter: { ...o, verification_status: 'requires_verification' },
          reason: `Severity differs: Gemini=${g.severity}, OpenRouter=${o.severity}`,
        });
        humanReview.push({ ...bestOf(g, o), verification_status: 'requires_verification', human_review_required: true });
      }
    } else {
      // Gemini-only.
      geminiOnly.push({ ...g, verification_status: detHas(g) ? 'verified' : 'requires_verification' });
      if (g.confidence !== 'confirmed') humanReview.push({ ...g, verification_status: 'requires_verification', human_review_required: true });
    }
  }
  for (let oi = 0; oi < openrouter.length; oi++) {
    if (matchedOpen.has(oi)) continue;
    const o = openrouter[oi];
    openrouterOnly.push({ ...o, verification_status: detHas(o) ? 'verified' : 'requires_verification' });
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
      sources: providerHits ? ['deterministic', ...(providerHits ? ['gemini'] : []), ...(providerHits ? ['openrouter'] : [])] : ['deterministic'],
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
    agreements: agreements.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity, sources: f.sources })),
    gemini_only: geminiOnly.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity })),
    openrouter_only: openrouterOnly.map((f) => ({ code: f.finding_code, title: f.title, severity: f.severity })),
    disagreements: disagreements.map((d) => ({ gemini: d.gemini.finding_code, openrouter: d.openrouter.finding_code, reason: d.reason })),
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
