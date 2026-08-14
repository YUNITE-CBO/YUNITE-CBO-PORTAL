/**
 * REPORT ENGINE.
 *
 * Rolls findings into an overall system health score (0..100) and a
 * structured final report. Score is penalized per severity (critical most).
 * The report engine NEVER promotes AI hypotheses to confirmed facts; it
 * tracks confidence + verification_status from each finding.
 */

import type { Finding, Severity } from './types';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0,
};

export interface ScoreResult {
  score: number; // 0..100
  counts: Record<Severity, number>;
  unresolved: number;
}

export function computeScore(findings: Finding[]): ScoreResult {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let penalty = 0;
  let unresolved = 0;
  for (const f of findings) {
    counts[f.severity]++;
    // Only penalize for findings not yet rejected/verified-clean. Confirmed
    // deterministic findings still count (they ARE the problem).
    if (f.verification_status === 'rejected') continue;
    penalty += SEVERITY_WEIGHT[f.severity];
    if (f.verification_status === 'requires_verification' || f.human_review_required) unresolved++;
  }
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, counts, unresolved };
}

export interface FinalReport {
  investigation_id: string;
  timestamp: string;
  overall_score: number;
  counts: Record<Severity, number>;
  unresolved: number;
  summary: string;
  findings: Finding[];
}

export function buildFinalReport(investigationId: string, findings: Finding[], summary: string): FinalReport {
  const { score, counts, unresolved } = computeScore(findings);
  return {
    investigation_id: investigationId,
    timestamp: new Date().toISOString(),
    overall_score: score,
    counts,
    unresolved,
    summary,
    findings: [...findings].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]),
  };
}
