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
  return [titleBlock(env, subtitle), metaBlock(env, org, extraMeta)];
}

/** The standard document closing: certification stamp + signatures. */
export function closing(env: DocumentEnvelope, signLabels?: string[]): Content[] {
  return [certificationStamp(env), signatureArea(signLabels)];
}

export { pageBreak, certificationStamp, signatureArea };
export { resolveOrgIdentity };
