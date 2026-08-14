/**
 * Shared deterministic findings helpers.
 *
 * Deterministic engines produce findings directly from the database/API —
 * no AI involved. These findings are CONFIRMED (verification_status =
 * 'confirmed', confidence 'confirmed') because they are computed, not
 * inferred. The AI is later asked to interpret/explain them; it never
 * overrides them.
 *
 * Deepened (req. #1, #2): `makeFinding` now accepts a `location` pinning
 * the database table/field, backend route/service, frontend component, and
 * member, plus expected/actual/difference, affected records, and systemic
 * flag. Engines populate as many location fields as they can identify.
 */

import type { EvidenceItem, Finding, FindingLocation, Severity } from '../types';

let seq = 0;
function nextCode(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export interface MakeFindingOpts {
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
  /** Deep forensic location (req. #2). */
  location?: FindingLocation;
  expected_value?: string;
  actual_value?: string;
  difference?: string;
  affected_records?: string[];
  is_systemic?: boolean;
  related_tables?: string[];
}

export function makeFinding(opts: MakeFindingOpts): Finding {
  return {
    finding_code: nextCode(opts.prefix),
    title: opts.title,
    module: opts.module ?? opts.location?.module,
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
    location: opts.location,
    expected_value: opts.expected_value,
    actual_value: opts.actual_value,
    difference: opts.difference,
    affected_records: opts.affected_records,
    is_systemic: opts.is_systemic ?? (opts.affected_records ? opts.affected_records.length > 1 : undefined),
    related_tables: opts.related_tables,
    is_verified: true,
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

/** Format a KES amount for human-readable evidence (req. #1). */
export function kes(n: number): string {
  return `KES ${Math.round(n * 100) / 100}`;
}
