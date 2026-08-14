/**
 * Shared deterministic findings helpers.
 *
 * Deterministic engines produce findings directly from the database/API —
 * no AI involved. These findings are CONFIRMED (verification_status =
 * 'confirmed', confidence 'confirmed') because they are computed, not
 * inferred. The AI is later asked to interpret/explain them; it never
 * overrides them.
 */

import type { EvidenceItem, Finding, Severity } from '../types';

let seq = 0;
function nextCode(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export function makeFinding(opts: {
  prefix: string;
  title: string;
  module?: string;
  category?: string;
  description: string;
  severity: Severity;
  root_cause?: string;
  recommendation?: string;
  human_review?: boolean;
  evidence: EvidenceItem[];
}): Finding {
  return {
    finding_code: nextCode(opts.prefix),
    title: opts.title,
    module: opts.module,
    category: opts.category,
    description: opts.description,
    severity: opts.severity,
    confidence: 'confirmed',
    verification_status: 'confirmed',
    human_review_required: opts.human_review ?? false,
    root_cause: opts.root_cause,
    recommendation: opts.recommendation,
    sources: ['deterministic'],
    evidence: opts.evidence,
  };
}

/** Reset the per-run finding-code sequence (call at the start of each run). */
export function resetFindingSequence(): void {
  seq = 0;
}

export function evidence(opts: EvidenceItem): EvidenceItem {
  return opts;
}

export function moneyDiff(a: number, b: number): string {
  const diff = Math.round((a - b) * 100) / 100;
  return `${diff >= 0 ? '+' : ''}${diff}`;
}
