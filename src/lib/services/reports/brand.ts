/**
 * YUNITE Pamoja CBO — Brand & Letterhead
 *
 * Single source of truth for the organization identity used across every
 * generated bank-like document (statements, member lists, financial
 * summaries, loan/contribution/fine reports, etc.).
 *
 * Theme: deep navy blue (#0B2A4A) + luminous green (#22C55E / #4ADE80),
 * derived from the official Yunite Pamoja CBO logo.
 *
 * The logo and the digital certification stamp are inlined as SVG strings
 * so the generated HTML/PDF documents are fully self-contained (no external
 * asset requests when rendered by the headless browser → reliable in
 * serverless/cron contexts and traceable on their own).
 */

export interface OrgIdentity {
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

export const ORG_IDENTITY: OrgIdentity = {
  name: 'Yunite Pamoja CBO',
  shortName: 'Yunite Pamoja',
  tagline: 'Community-Based Organization',
  email: 'info.yunite.ke@gmail.com',
  phone: '+254 700 000 000',
  address: 'Kariobangi North',
  city: 'Nairobi',
  country: 'Kenya',
  website: 'yunitepamoja.org',
  registrationNumber: 'CBO/NAI/YP/001',
  currency: 'KES',
  copyright: `© ${new Date().getFullYear()} Yunite Pamoja CBO. All rights reserved. This is a computer-generated, digitally certified document issued by Yunite Pamoja CBO. Unauthorized alteration, forgery, or reproduction of this document is prohibited and may constitute an offence under Kenyan law.`,
};

/** Brand palette — mirrors the official logo. */
export const BRAND_COLORS = {
  navy: '#0B2A4A',
  navyDark: '#0A1E33',
  navyLight: '#14365C',
  green: '#22C55E',
  greenBright: '#4ADE80',
  greenSoft: '#E8FFF0',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  paper: '#FFFFFF',
  zebra: '#F8FAFC',
} as const;

/**
 * Logo mark (emblem + wordmark) as an inline SVG string.
 * Dimensions are tuned for a letterhead header strip.
 */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64" role="img" aria-label="Yunite Pamoja CBO">
  <defs>
    <linearGradient id="ypRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B2A4A"/><stop offset="1" stop-color="#0A1E33"/>
    </linearGradient>
    <linearGradient id="ypAccent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#22C55E"/>
    </linearGradient>
  </defs>
  <g transform="translate(4,4)">
    <circle cx="28" cy="28" r="26" fill="url(#ypRing)"/>
    <circle cx="28" cy="28" r="26" fill="none" stroke="#4ADE80" stroke-width="3" opacity="0.9"/>
    <path d="M28 6 a22 22 0 0 1 0 44 a22 22 0 0 1 0 -44" fill="none" stroke="url(#ypAccent)" stroke-width="4"/>
    <text x="28" y="37" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" fill="#4ADE80">Y</text>
  </g>
  <g transform="translate(68,0)">
    <text x="0" y="30" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#0B2A4A">YUNITE</text>
    <text x="98" y="30" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#22C55E">PAMOJA</text>
    <text x="0" y="48" font-family="Arial, Helvetica, sans-serif" font-size="10.5" letter-spacing="2.2" fill="#0B2A4A" opacity="0.75">COMMUNITY-BASED ORGANIZATION</text>
  </g>
</svg>`;

/**
 * Digital certification stamp as an inline SVG string.
 * `__REF__`, `__DATE__`, `__HASH__`, `__VERIFY_URL__` placeholders are
 * substituted by the renderer for traceability on a per-document basis.
 */
export const STAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110" role="img" aria-label="Certified by Yunite Pamoja CBO">
  <defs>
    <radialGradient id="ypStampFill" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#E8FFF0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <g transform="translate(6,7)">
    <circle cx="48" cy="48" r="42" fill="url(#ypStampFill)" stroke="#0B2A4A" stroke-width="3"/>
    <circle cx="48" cy="48" r="35" fill="none" stroke="#0B2A4A" stroke-width="1.3" stroke-dasharray="3 2.5"/>
    <circle cx="48" cy="48" r="23" fill="none" stroke="#22C55E" stroke-width="2"/>
    <path d="M36 48 l8 9 l16 -20" fill="none" stroke="#22C55E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path id="ypStampTopArc" d="M48 6 a42 42 0 0 1 0 84" fill="none"/>
    <path id="ypStampBotArc" d="M48 90 a42 42 0 0 1 0 -84" fill="none"/>
    <text font-family="Georgia, 'Times New Roman', serif" font-size="9" font-weight="700" letter-spacing="2.2" fill="#0B2A4A">
      <textPath href="#ypStampTopArc" startOffset="50%" text-anchor="middle">YUNITE PAMOJA CBO</textPath>
    </text>
    <text font-family="Arial, Helvetica, sans-serif" font-size="6.2" letter-spacing="1.6" fill="#0B2A4A">
      <textPath href="#ypStampBotArc" startOffset="50%" text-anchor="middle">CERTIFIED · OFFICIAL DOCUMENT</textPath>
    </text>
  </g>
  <g transform="translate(110,16)">
    <text x="0" y="13" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700" fill="#0B2A4A">DOCUMENT CERTIFIED</text>
    <line x1="0" y1="19" x2="98" y2="19" stroke="#22C55E" stroke-width="1.5"/>
    <text x="0" y="32" font-family="Arial, Helvetica, sans-serif" font-size="7.4" fill="#0B2A4A">Ref: <tspan font-weight="700">__REF__</tspan></text>
    <text x="0" y="44" font-family="Arial, Helvetica, sans-serif" font-size="7.4" fill="#0B2A4A">Issued: <tspan font-weight="700">__DATE__</tspan></text>
    <text x="0" y="56" font-family="Arial, Helvetica, sans-serif" font-size="6.6" fill="#0B2A4A">Hash: <tspan font-weight="700">__HASH__</tspan></text>
    <text x="0" y="70" font-family="Arial, Helvetica, sans-serif" font-size="6" fill="#0B2A4A" opacity="0.75">Verify: __VERIFY_URL__</text>
  </g>
</svg>`;

/** Public verification base URL (used in the stamp traceability line). */
export const VERIFY_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://yunitepamoja.org';

export function formatMoney(amount: number, currency = ORG_IDENTITY.currency): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
