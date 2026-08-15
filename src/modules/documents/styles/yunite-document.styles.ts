/**
 * YUNITE DOCUMENT DESIGN SYSTEM
 *
 * Single source of truth for the visual identity applied to every generated
 * document: the navy/green palette (from the official Yunite Pamoja CBO
 * logo), typography, table layouts, and reusable pdfmake style definitions.
 *
 * Organization identity is loaded from YUNITE configuration (settings) with a
 * fallback to the canonical brand identity in `brand.ts`, so a deployed org
 * can override name/contacts without touching code.
 */

import { BRAND_COLORS, ORG_IDENTITY } from '@/lib/services/reports/brand';
import { settingsService } from '@/lib/services/settings.service';
import type { CustomTableLayout } from 'pdfmake';

/** Resolved organization identity for a document (settings-overridable). */
export interface ResolvedOrgIdentity {
  name: string;
  shortName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  website: string;
  registrationNumber: string;
  currency: string;
  copyright: string;
}

let cachedOrg: ResolvedOrgIdentity | null = null;

/**
 * Resolve the org identity from settings (organization.* keys) with a fallback
 * to the canonical brand identity. Cached for the process lifetime; settings
 * rarely change mid-flight and this avoids a DB hit per document.
 */
export async function resolveOrgIdentity(): Promise<ResolvedOrgIdentity> {
  if (cachedOrg) return cachedOrg;
  const base = ORG_IDENTITY;
  let resolved: ResolvedOrgIdentity = {
    name: base.name,
    shortName: base.shortName,
    tagline: base.tagline,
    email: base.email,
    phone: base.phone,
    address: base.address,
    city: base.city,
    country: base.country,
    website: base.website,
    registrationNumber: base.registrationNumber,
    currency: base.currency,
    copyright: base.copyright,
  };
  try {
    const vals = await settingsService.getMany([
      'organization.name',
      'organization.email',
      'organization.phone',
      'organization.address',
      'organization.currency',
    ]);
    if (vals['organization.name']) resolved.name = vals['organization.name'];
    if (vals['organization.email']) resolved.email = vals['organization.email'];
    if (vals['organization.phone']) resolved.phone = vals['organization.phone'];
    if (vals['organization.address']) resolved.address = vals['organization.address'];
    if (vals['organization.currency']) resolved.currency = vals['organization.currency'];
  } catch {
    // settings unavailable (e.g. test env) — keep the canonical identity.
  }
  cachedOrg = resolved;
  return resolved;
}

/** Test-only: reset the cached org identity so a fresh resolve runs. */
export function _resetOrgIdentityCache(): void {
  cachedOrg = null;
}

/**
 * pdfmake style definitions shared by every YUNITE document. Named styles are
 * referenced from templates via `style: 'name'`; ad-hoc overrides stay local.
 */
export const YUNITE_STYLES = {
  // Letterhead
  orgName: { fontSize: 20, bold: true, color: BRAND_COLORS.navy, font: 'Roboto' },
  orgTagline: { fontSize: 9, color: BRAND_COLORS.navy, opacity: 0.8, font: 'Roboto' },
  orgContacts: { fontSize: 8, color: BRAND_COLORS.muted, font: 'Roboto' },
  // Title block
  eyebrow: { fontSize: 8, bold: true, color: BRAND_COLORS.green, font: 'Roboto' },
  docTitle: { fontSize: 22, bold: true, color: BRAND_COLORS.navy, font: 'Roboto' },
  subtitle: { fontSize: 9, color: BRAND_COLORS.muted, font: 'Roboto' },
  // Meta + sections
  metaLabel: { fontSize: 8, color: BRAND_COLORS.muted, font: 'Roboto' },
  metaValue: { fontSize: 9, bold: true, color: BRAND_COLORS.navy, font: 'Roboto' },
  sectionTitle: { fontSize: 13, bold: true, color: BRAND_COLORS.navy, font: 'Roboto', margin: [0, 14, 0, 4] },
  // Body
  body: { fontSize: 10, color: BRAND_COLORS.ink, font: 'Roboto' },
  bodySmall: { fontSize: 8, color: BRAND_COLORS.muted, font: 'Roboto' },
  // Tables
  tableHeader: { fontSize: 8.5, bold: true, color: '#FFFFFF', font: 'Roboto' },
  tableCell: { fontSize: 9, color: BRAND_COLORS.ink, font: 'Roboto' },
  tableCellNum: { fontSize: 9, color: BRAND_COLORS.ink, alignment: 'right', font: 'Roboto' },
  tableFooter: { fontSize: 9, bold: true, color: BRAND_COLORS.navy, font: 'Roboto' },
  // KPIs
  kpiLabel: { fontSize: 8, color: BRAND_COLORS.muted, font: 'Roboto' },
  kpiValue: { fontSize: 15, bold: true, color: BRAND_COLORS.navy, font: 'Roboto' },
  // Footer
  footerCopy: { fontSize: 7, color: BRAND_COLORS.muted, font: 'Roboto' },
  footerMeta: { fontSize: 7, color: BRAND_COLORS.muted, font: 'Roboto' },
  // Severity badges (text-only in pdfmake)
  critical: { fontSize: 8, bold: true, color: '#DC2626', font: 'Roboto' },
  high: { fontSize: 8, bold: true, color: '#EA580C', font: 'Roboto' },
  medium: { fontSize: 8, bold: true, color: '#D97706', font: 'Roboto' },
  low: { fontSize: 8, bold: true, color: '#2563EB', font: 'Roboto' },
  info: { fontSize: 8, bold: true, color: BRAND_COLORS.muted, font: 'Roboto' },
} as const;

/** Default page geometry for A4 portrait documents. */
export const PAGE_GEOMETRY = {
  portrait: { pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [40, 90, 40, 70] },
  landscape: { pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [40, 90, 40, 70] },
} as const;

/**
 * Default table layout — light header background, zebra rows, and thin grid
 * lines matching the HTML renderer's look. Registered with pdfmake via
 * `setTableLayouts`.
 */
export const YUNITE_TABLE_LAYOUT: Record<string, CustomTableLayout> = {
  yunite: {
    hLineColor: (i, node) =>
      i === 0 || i === node.table.body.length ? BRAND_COLORS.navy : BRAND_COLORS.line,
    vLineColor: () => BRAND_COLORS.line,
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    fillColor: (rowIndex) => {
      if (rowIndex === 0) return BRAND_COLORS.navy;
      if (rowIndex % 2 === 0) return BRAND_COLORS.zebra;
      return null;
    },
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  },
};
