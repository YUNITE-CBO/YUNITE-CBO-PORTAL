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
import fs from 'fs';
import path from 'path';

/**
 * Resolved organization identity for a document — the single
 * `OrganizationDocumentProfile` consumed by every template.
 *
 * Every field is resolved from the `organization.*` settings (the
 * authoritative source) with the canonical `ORG_IDENTITY` as a fallback ONLY
 * when a setting is absent/empty. The registration number is NEVER invented:
 * when unconfigured it resolves to empty and `registrationNumberConfigured`
 * is false so templates can show a 'Not Configured' indicator instead of a
 * fabricated number.
 */
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
  /** True only when a real registration number is configured in settings. */
  registrationNumberConfigured: boolean;
  currency: string;
  copyright: string;
  logoUrl: string;
}

/** Display string for an unconfigured registration number (never a fake). */
export const REGISTRATION_NOT_CONFIGURED = 'Not Configured';

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
    registrationNumber: '',
    registrationNumberConfigured: false,
    currency: base.currency,
    copyright: base.copyright,
    logoUrl: base.logoUrl,
  };
  try {
    const vals = await settingsService.getMany([
      'organization.name',
      'organization.email',
      'organization.phone',
      'organization.address',
      'organization.currency',
      'organization.registration_number',
      'organization.website',
      'organization.city',
      'organization.country',
      'organization.logo_url',
    ]);
    const pick = (key: string, fallback: string) => {
      const v = vals[key];
      return v && String(v).trim() ? String(v).trim() : fallback;
    };
    resolved.name = pick('organization.name', base.name);
    resolved.email = pick('organization.email', base.email);
    resolved.phone = pick('organization.phone', base.phone);
    resolved.address = pick('organization.address', base.address);
    resolved.currency = pick('organization.currency', base.currency);
    resolved.website = pick('organization.website', base.website);
    resolved.city = pick('organization.city', base.city);
    resolved.country = pick('organization.country', base.country);
    resolved.logoUrl = pick('organization.logo_url', base.logoUrl);
    const regRaw = vals['organization.registration_number'];
    const regTrim = regRaw && String(regRaw).trim() ? String(regRaw).trim() : '';
    resolved.registrationNumber = regTrim;
    resolved.registrationNumberConfigured = regTrim.length > 0;
  } catch {
    // settings unavailable (e.g. test env) — keep the canonical identity.
    // Registration number stays unconfigured (never invented).
  }
  cachedOrg = resolved;
  return resolved;
}

/** Test-only: reset the cached org identity so a fresh resolve runs. */
export function _resetOrgIdentityCache(): void {
  cachedOrg = null;
  cachedLogoDataUri = null;
}

/**
 * Resolve the official organization logo as a base64 data URI for embedding in
 * PDF documents. The logo is the authoritative PNG asset supplied by the org;
 * it is used AS-IS (never recreated/redrawn). Resolution order:
 *  1. A local PNG file path (preferred) — searched in `public/branding/logo.png`
 *     and the `organization.logo_url` setting if it points at a readable file.
 *  2. Falls back to null (no logo) when no PNG is available; templates then
 *     render the org name as text (never a substitute icon).
 *
 * pdfmake embeds `image` nodes from data URIs; the generator blocks remote
 * URLs + local FS access internally, so the logo MUST be read here as base64
 * and passed as a data URI — never a filesystem/remote path.
 */
let cachedLogoDataUri: string | null | undefined;

export async function resolveLogoDataUri(): Promise<string | null> {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  let resolved: string | null = null;
  try {
    const candidates: string[] = [];
    // 1. The canonical supplied PNG location.
    candidates.push(path.join(process.cwd(), 'public', 'branding', 'logo.png'));
    // 2. If the settings logo_url points at a real local file, prefer it.
    const logoSetting = await settingsService.get('organization.logo_url');
    if (logoSetting) {
      const p = String(logoSetting).trim();
      if (p && !p.startsWith('http')) candidates.unshift(path.isAbsolute(p) ? p : path.join(process.cwd(), p));
    }
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const buf = fs.readFileSync(candidate);
        const ext = path.extname(candidate).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
        resolved = `data:${mime};base64,${buf.toString('base64')}`;
        break;
      }
    }
  } catch {
    resolved = null;
  }
  cachedLogoDataUri = resolved;
  return resolved;
}

/** Test-only: reset the cached logo so a fresh resolve runs. */
export function _resetLogoCache(): void {
  cachedLogoDataUri = undefined;
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
