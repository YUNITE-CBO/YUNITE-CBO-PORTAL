/**
 * Header + footer + page-number builders for the YUNITE Document Engine.
 *
 * pdfmake renders `header`/`footer` functions on every page, passing the
 * current page number + page count. These build the branded letterhead
 * header strip, the footer copyright + doc ref + page numbers, and the
 * page-number node used inside the footer.
 */

import type { ResolvedOrgIdentity } from '../styles/yunite-document.styles';
import { REGISTRATION_NOT_CONFIGURED } from '../styles/yunite-document.styles';
import type { DocumentEnvelope } from '../types/document.types';
import { BRAND_COLORS } from '@/lib/services/reports/brand';
import { formatDate, formatDateTime } from './formatting';
import type { Content } from 'pdfmake';

/** Default "Prepared By" value for system-generated documents (never blank). */
export const PREPARED_BY_SYSTEM = 'YUNITE PAMOJA CBO System';

/**
 * Build the org contact line for the letterhead: address / phone / email /
 * website — only the fields actually configured (no fake placeholders).
 */
function orgContactLine(org: ResolvedOrgIdentity): string {
  const parts: string[] = [];
  const addressBits = [org.address, org.city, org.country].filter((p) => p && p.trim());
  if (addressBits.length) parts.push(addressBits.join(', '));
  if (org.phone) parts.push(org.phone);
  if (org.email) parts.push(org.email);
  if (org.website) parts.push(org.website);
  return parts.join('  ·  ');
}

/**
 * The repeating page header: [LOGO] + org name + tagline + registration number
 * on the left, doc ref + page indicator on the right. Kept compact so the body
 * margin (90pt top) fits it. The registration number comes from Settings; if
 * not configured it shows a 'Not Configured' indicator (never a fabricated
 * number). The logo, when available, is the authoritative PNG supplied by the
 * org, rendered AS-IS preserving aspect ratio (fit width 64pt, proportional
 * height); when no logo is configured the org name is shown as text.
 */
export function pageHeader(org: ResolvedOrgIdentity, env: DocumentEnvelope, logoDataUri?: string | null): Content {
  const regLine = org.registrationNumberConfigured
    ? `CBO Reg. No: ${org.registrationNumber}`
    : `CBO Reg. No: ${REGISTRATION_NOT_CONFIGURED}`;
  const contacts = orgContactLine(org);
  const leftColumn = {
    width: '*',
    columns: [
      ...(logoDataUri
        ? [{
            width: 64,
            image: logoDataUri,
            fit: [64, 48],
            margin: [0, 0, 8, 0],
          } as unknown]
        : []),
      {
        width: '*',
        stack: [
          { text: org.name, style: 'orgName' },
          { text: `${org.tagline}`, style: 'orgTagline' },
          { text: regLine, style: 'orgTagline' },
          ...(contacts ? [{ text: contacts, style: 'orgContacts' }] : []),
        ],
      } as unknown,
    ],
  } as unknown;
  return {
    margin: [40, 20, 40, 0],
    stack: [
      {
        columns: [
          leftColumn,
          {
            width: 'auto',
            stack: [
              { text: env.eyebrow.toUpperCase(), style: 'eyebrow', alignment: 'right' },
              { text: env.documentNumber, style: 'metaValue', alignment: 'right' },
            ],
          },
        ],
      },
      {
        canvas: [
          {
            type: 'rect',
            x: 0, y: 0, w: 515, h: 3,
            color: BRAND_COLORS.navy,
            fillColor: BRAND_COLORS.navy,
          },
        ],
        margin: [0, 6, 0, 0],
      },
    ],
  } as unknown as Content;
}

/**
 * The repeating page footer: org name + 'System Generated Document' +
 * doc ref + auth hash + verify URL + Prepared By + page number.
 */
export function pageFooter(org: ResolvedOrgIdentity, env: DocumentEnvelope): (currentPage: number, pageCount: number) => Content {
  return (currentPage: number, pageCount: number): Content => ({
    margin: [40, 0, 40, 24],
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: 0, y1: 0, x2: 515, y2: 0,
            lineWidth: 1,
            lineColor: BRAND_COLORS.green,
          },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        columns: [
          { width: '*', text: org.copyright, style: 'footerCopy' },
          {
            width: 'auto',
            text: `Page ${currentPage} of ${pageCount}`,
            style: 'footerMeta',
            alignment: 'right',
          },
        ],
      },
      {
        columns: [
          { width: '*', text: `${org.name} · System Generated Document`, style: 'footerMeta' },
          { width: 'auto', text: `Doc Ref: ${env.documentNumber}`, style: 'footerMeta', alignment: 'right' },
        ],
        margin: [0, 2, 0, 0],
      },
      {
        columns: [
          { width: '*', text: `Prepared By: ${PREPARED_BY_SYSTEM}`, style: 'footerMeta' },
          { width: 'auto', text: `Generated: ${formatDateTime(env.generatedAt)}`, style: 'footerMeta', alignment: 'right' },
        ],
        margin: [0, 2, 0, 0],
      },
      {
        text: `Verify authenticity: ${env.verifyUrl}`,
        style: 'footerMeta',
        margin: [0, 2, 0, 0],
      },
    ],
  } as unknown as Content);
}

/** The document title block (eyebrow + title + subtitle) placed once at the top of the body. */
export function titleBlock(env: DocumentEnvelope, subtitle?: string): Content {
  return {
    stack: [
      { text: env.eyebrow.toUpperCase(), style: 'eyebrow' },
      { text: env.title, style: 'docTitle', margin: [0, 2, 0, 2] },
      ...(subtitle ? [{ text: subtitle, style: 'subtitle' }] : []),
    ],
    margin: [0, 0, 0, 6],
  } as unknown as Content;
}

/** The meta block: report type / period / date issued / generated by / prepared by / currency. */
export function metaBlock(env: DocumentEnvelope, org: ResolvedOrgIdentity, extra?: Array<[string, string]>): Content {
  const generatedBy = env.issuer ? `${env.issuer.name} (${env.issuer.role})` : PREPARED_BY_SYSTEM;
  const rows: Array<[string, string]> = [
    ['Period', env.period.label],
    ['Date Issued', formatDate(env.generatedAt)],
    ['Document Ref', env.documentNumber],
    ['Prepared By', generatedBy],
    ['Currency', org.currency],
    ...(env.classification ? [['Classification', env.classification] as [string, string]] : []),
    ...(extra ?? []),
  ];
  return {
    stack: rows.map(([label, value]) => ({
      columns: [
        { width: 110, text: label, style: 'metaLabel' },
        { width: '*', text: value, style: 'metaValue' },
      ],
    })),
    margin: [0, 4, 0, 10],
  } as unknown as Content;
}

/**
 * A certification stamp block — an ORGANIZATIONAL/SYSTEM certification, not a
 * fake government seal. Clearly states the document was generated by the
 * official YUNITE PAMOJA CBO system and is digitally verified.
 */
export function certificationStamp(env: DocumentEnvelope): Content {
  return {
    stack: [
      { text: 'YUNITE PAMOJA CBO', style: 'metaValue', color: BRAND_COLORS.navy },
      { text: 'OFFICIAL SYSTEM-GENERATED DOCUMENT', style: 'footerMeta', color: BRAND_COLORS.navy },
      { text: 'Digitally Generated & Verified', style: 'footerMeta' },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1.5, lineColor: BRAND_COLORS.green }], margin: [0, 2, 0, 2] },
      { text: `Document ID: ${env.documentNumber}`, style: 'footerMeta' },
      { text: `Generated: ${formatDate(env.generatedAt)}`, style: 'footerMeta' },
      { text: `Verification Code: ${env.authHash}`, style: 'footerMeta' },
      { text: `Verify: ${env.verifyUrl}`, style: 'footerMeta' },
    ],
    margin: [0, 14, 0, 6],
    alignment: 'right',
  } as unknown as Content;
}

/**
 * A signature/approval area. "Prepared By" is pre-filled with the system
 * default (never blank for system-generated documents); the issuer (authorized
 * user) is shown additionally when known.
 */
export function signatureArea(labels: string[] = ['Prepared By', 'Approved By'], issuerName?: string): Content {
  return {
    columns: labels.map((label) => {
      const value = label === 'Prepared By' ? (issuerName ?? PREPARED_BY_SYSTEM) : '';
      return {
        width: '*',
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.5, lineColor: BRAND_COLORS.muted }], margin: [0, 18, 0, 2] },
          { text: `${label}${value ? `: ${value}` : ''}`, style: 'footerMeta' },
        ],
      };
    }),
    margin: [0, 10, 0, 10],
    columnGap: 30,
  } as unknown as Content;
}

/** A forced page break. pdfmake requires a text node — a bare
 * `{ pageBreak: 'after' }` is rejected as an unrecognized structure. */
export function pageBreak(): Content {
  return { text: ' ', pageBreak: 'after' } as unknown as Content;
}
