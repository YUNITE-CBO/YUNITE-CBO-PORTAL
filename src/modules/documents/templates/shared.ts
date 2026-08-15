/**
 * Shared template primitives used across all YUNITE document templates.
 *
 * Templates build `Content[]` (pdfmake content nodes) from the structured
 * data + envelope. This module centralizes the common building blocks
 * (title/meta blocks, KPI grids, section headers) so each template stays
 * focused on its own report shape.
 */

import type { Content } from 'pdfmake';
import { resolveOrgIdentity } from '../styles/yunite-document.styles';
import type { DocumentEnvelope } from '../types/document.types';
import { titleBlock, metaBlock, certificationStamp, signatureArea, pageBreak } from '../utils/headers';
import { divider } from '../utils/tables';
import { BRAND_COLORS } from '@/lib/services/reports/brand';
import type { DataQualityReport } from '@/lib/services/reports/report-data-quality.service';

/** KPI card: label over value, in a bordered box. */
export function kpiCard(label: string, value: string, accentColor: string = BRAND_COLORS.navy): Content {
  return {
    stack: [
      { text: label.toUpperCase(), style: 'kpiLabel' },
      { text: value, style: 'kpiValue', color: accentColor },
    ],
    borderColor: [BRAND_COLORS.line, BRAND_COLORS.line, BRAND_COLORS.line, accentColor],
    borderWidth: { top: 0, right: 0.5, bottom: 0.5, left: 3 },
    padding: 6,
    width: '*',
  } as unknown as Content;
}

/** A row of KPI cards laid out in equal columns. */
export function kpiRow(cards: Array<{ label: string; value: string; accent?: string }>): Content {
  return {
    columns: cards.map((c) => kpiCard(c.label, c.value, c.accent)),
    columnGap: 8,
    margin: [0, 4, 0, 10],
  } as unknown as Content;
}

/** A section header (green eyebrow + navy title + divider). */
export function sectionHeader(title: string): Content[] {
  return [
    { text: title, style: 'sectionTitle' } as unknown as Content,
    divider(),
  ];
}

/** Build the standard document preamble: title + meta block. */
export async function preamble(env: DocumentEnvelope, subtitle?: string, extraMeta?: Array<[string, string]>): Promise<Content[]> {
  const org = await resolveOrgIdentity();
  const meta: Content[] = [titleBlock(env, subtitle), metaBlock(env, org, extraMeta)];
  // Surface a data-quality indicator before the body when reconciliation ran.
  if (env.dataQuality) meta.push(dataQualityBlock(env.dataQuality));
  return meta;
}

/**
 * Data-quality / reconciliation indicator block. Computed from real validation
 * results (never an invented percentage). Shows the overall status, the quality
 * percentage, and lists verified / requires-reconciliation / unavailable
 * domains. This is the internal administrator data-preview capability
 * (requirement #21, #30) embedded directly in the generated document.
 */
export function dataQualityBlock(q: DataQualityReport): Content {
  const statusColor =
    q.overall === 'verified' ? BRAND_COLORS.green : q.overall === 'requires_reconciliation' ? '#DC2626' : BRAND_COLORS.muted;
  const rows: Array<{ label: string; value: string; color?: string }> = [
    { label: 'Data Quality', value: `${q.qualityPercent}%`, color: statusColor },
    { label: 'Status', value: q.overall === 'verified' ? 'VERIFIED' : q.overall === 'requires_reconciliation' ? 'REQUIRES RECONCILIATION' : 'UNAVAILABLE', color: statusColor },
  ];
  return {
    stack: [
      {
        columns: rows.map((r) => ({
          width: '*',
          stack: [{ text: r.label.toUpperCase(), style: 'kpiLabel' }, { text: r.value, style: 'kpiValue', color: r.color }],
          borderColor: [BRAND_COLORS.line, BRAND_COLORS.line, BRAND_COLORS.line, statusColor],
          borderWidth: { top: 0, right: 0.5, bottom: 0.5, left: 3 },
          padding: 6,
        })),
        columnGap: 8,
        margin: [0, 6, 0, 6],
      } as unknown as Content,
      { text: q.summary, style: 'bodySmall', margin: [0, 0, 0, 4] },
      ...(q.requiresReconciliation.length
        ? [
            {
              text: `Requires reconciliation: ${q.requiresReconciliation.join(', ')}`,
              style: 'bodySmall',
              color: '#DC2626',
            } as unknown as Content,
          ]
        : []),
    ],
  } as unknown as Content;
}

/** The standard document closing: certification stamp + signatures. The
 * "Prepared By" signature is pre-filled with the authorized issuer (when
 * known) or the system default — never blank. */
export function closing(env: DocumentEnvelope, signLabels?: string[], issuerName?: string): Content[] {
  return [certificationStamp(env), signatureArea(signLabels, issuerName ?? env.issuer?.name)];
}

export { pageBreak, certificationStamp, signatureArea };
export { resolveOrgIdentity };
