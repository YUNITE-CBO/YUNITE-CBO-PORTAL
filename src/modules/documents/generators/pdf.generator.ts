/**
 * PDF GENERATOR — server-side, browser-independent.
 *
 * Uses `pdfmake` (pure-JavaScript PDF generation, no Chromium/Puppeteer/
 * Playwright). Works identically on local dev, Render free tier, Docker,
 * Linux, and CI/CD — it needs NO browser binary, NO executable path, and NO
 * postinstall download.
 *
 * The generator is a thin presentation layer: it receives a complete
 * `DocumentRequest` (envelope + already-validated structured data) and a
 * `content` array of pdfmake nodes built by a template, then produces a PDF
 * Buffer. It never queries the database and never calculates financial values.
 */

import type { Content, TDocumentDefinitions, CustomTableLayout } from 'pdfmake/interfaces';
import { resolveOrgIdentity, YUNITE_STYLES, PAGE_GEOMETRY, YUNITE_TABLE_LAYOUT } from '../styles/yunite-document.styles';
import { pageHeader, pageFooter } from '../utils/headers';
import type { DocumentRequest } from '../types/document.types';

// pdfmake 0.3.x ships a CommonJS singleton instance. The @types package types
// the named exports, but destructuring them loses the singleton's `this`
// binding at runtime (setFonts/createPdf throw "Cannot set properties of
// undefined"). We require the singleton directly and call methods on it; the
// virtualfs + access-policy setters aren't in @types so they're declared below.
type PdfMakeVfs = { existsSync: (f: string) => boolean; writeFileSync: (f: string, c: string, enc: string) => void };
type PdfMakeSingleton = {
  virtualfs: PdfMakeVfs;
  setFonts: (f: Record<string, unknown>) => void;
  setUrlAccessPolicy: (cb: (url: string) => boolean) => void;
  setLocalAccessPolicy: (cb: (path: string) => boolean) => void;
  setTableLayouts: (l: Record<string, CustomTableLayout>) => void;
  createPdf: (def: TDocumentDefinitions) => { getBuffer: () => Promise<Buffer> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as PdfMakeSingleton;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsData = require('pdfmake/build/vfs_fonts.js') as Record<string, string>;

let initialised = false;
function ensureInitialised(): void {
  if (initialised) return;
  // Load each bundled Roboto font into the virtual file system (base64 → Buffer).
  for (const [filename, content] of Object.entries(vfsData)) {
    if (typeof content === 'string' && !pdfmake.virtualfs.existsSync(filename)) {
      pdfmake.virtualfs.writeFileSync(filename, content, 'base64');
    }
  }
  pdfmake.setFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-Italic.ttf',
    },
  });
  // Restrict external URLs + local FS access (defence-in-depth; we never embed
  // remote images or read local files during generation).
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  pdfmake.setTableLayouts(YUNITE_TABLE_LAYOUT);
  initialised = true;
}

export interface GeneratePdfOptions {
  /** Body content nodes (built by a template). */
  content: Content[];
  /** Page orientation (default portrait). */
  orientation?: 'portrait' | 'landscape';
  /** Document envelope for the header/footer. */
  envelope: DocumentRequest['envelope'];
}

/**
 * Generate a PDF Buffer from pdfmake content nodes + the document envelope.
 *
 * The header (org letterhead + doc ref) and footer (copyright + page numbers +
 * verify URL) are rendered on every page automatically by pdfmake.
 */
export async function generatePdf(opts: GeneratePdfOptions): Promise<Buffer> {
  ensureInitialised();
  const org = await resolveOrgIdentity();
  const geometry = opts.orientation === 'landscape' ? PAGE_GEOMETRY.landscape : PAGE_GEOMETRY.portrait;

  const docDefinition: TDocumentDefinitions = {
    ...(geometry as unknown as Partial<TDocumentDefinitions>),
    header: pageHeader(org, opts.envelope) as unknown as Content,
    footer: pageFooter(org, opts.envelope) as unknown as Content,
    content: opts.content,
    styles: YUNITE_STYLES as unknown as TDocumentDefinitions['styles'],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1F2937', lineHeight: 1.3 },
    info: {
      title: opts.envelope.title,
      author: org.name,
      subject: `${opts.envelope.eyebrow} — ${opts.envelope.period.label}`,
      keywords: `${opts.envelope.documentNumber}, ${opts.envelope.authHash}, YUNITE, CBO`,
    },
  };

  const doc = pdfmake.createPdf(docDefinition);
  const buffer: Buffer = await doc.getBuffer();
  return buffer;
}

/** Re-export the brand resolver so templates can build org-aware content. */
export { resolveOrgIdentity } from '../styles/yunite-document.styles';
