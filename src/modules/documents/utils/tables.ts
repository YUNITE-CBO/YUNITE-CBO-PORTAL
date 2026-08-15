/**
 * Table helpers for the YUNITE Document Engine.
 *
 * Build pdfmake `table` content nodes from plain JS rows. pdfmake handles
 * automatic pagination of long tables (including repeating header rows) when
 * the header row is marked with `rowSpan`/`headerRows: 1` — these helpers do
 * that, so a 100+ row transaction ledger flows across pages cleanly.
 */

import type { Content } from 'pdfmake';
import { BRAND_COLORS } from '@/lib/services/reports/brand';

export interface ColumnSpec {
  /** Header label. */
  header: string;
  /** Column width: number (pt), 'auto', '*', or a fixed percentage string. */
  width?: number | 'auto' | '*';
  /** Right-align numeric columns. */
  numeric?: boolean;
}

/**
 * Default width (pt) for numeric/money columns that do not specify an explicit
 * width. Wide enough for "Ksh 1,234,567.89"-style values, compact enough that
 * several can sit side-by-side on an A4 page.
 */
const DEFAULT_NUMERIC_WIDTH = 58;

/**
 * Resolve a column's effective pdfmake width.
 *
 * Columns that specify an explicit `width` keep it. Otherwise numeric columns
 * get a compact fixed width and text columns get `'*'` (share the remaining
 * page width and wrap their content). This is the critical fix for tables
 * overflowing the page: the previous default of `'auto'` sized every column to
 * its raw content, so a 7-8 column table (member statement, loan portfolio,
 * fines, transaction ledger) blew past the A4 usable width and pdfmake clipped
 * the right-hand columns off the page. Star columns are bounded by the
 * available page width, so the table can never overflow regardless of how many
 * columns or how long the cell text is.
 */
function resolveWidth(c: ColumnSpec): number | 'auto' | '*' {
  if (c.width !== undefined) return c.width;
  return c.numeric ? DEFAULT_NUMERIC_WIDTH : '*';
}

/**
 * Make a long, unbreakable string (transaction refs, loan numbers, hashes such
 * as `TXN-20260804-SDP-c19870b6`) wrappable inside a fixed/star column. pdfmake
 * only wraps on whitespace, so a single 24-char token with no spaces would
 * overflow its cell even in a `'*'` column. We insert a zero-width space (U+200B)
 * after hyphens and at ~10-char boundaries so pdfmake can break the token across
 * lines without showing any visible separator. Already-short / spaced strings
 * pass through untouched.
 */
const ZERO_WIDTH_SPACE = '\u200B';
function wrapLongToken(s: string): string {
  if (typeof s !== 'string') return s;
  // Only inject breaks into tokens that are long enough to risk overflow.
  if (s.length <= 12) return s;
  // Break after hyphens (most refs are hyphen-delimited).
  let out = s.replace(/-/g, '-' + ZERO_WIDTH_SPACE);
  // For any remaining run of 10+ non-space, non-break chars, insert a break
  // every 10 characters.
  out = out.replace(/([^\s\u200B-]{10})(?=[^\s\u200B-])/g, '$1' + ZERO_WIDTH_SPACE);
  return out;
}

/** Normalize a cell value into a pdfmake-renderable, wrappable cell. */
function toCell(value: unknown, isNumeric: boolean): unknown {
  if (value === null || value === undefined || value === '') {
    return { text: '—', style: 'tableCell', alignment: isNumeric ? 'right' : 'left' };
  }
  // Already a pdfmake node (object with `text` or `stack`/`ul`/`columns`).
  if (typeof value === 'object') return value;
  const str = String(value);
  return {
    text: wrapLongToken(str),
    style: 'tableCell',
    alignment: isNumeric ? 'right' : 'left',
  };
}

/**
 * Build a pdfmake table node with a repeating header row.
 *
 * @param columns column specs (header + width + alignment)
 * @param rows array of already-formatted cell strings (or {text, style} nodes)
 * @param totalsRow optional footer row (same shape as a data row)
 */
export function buildTable(
  columns: ColumnSpec[],
  rows: Array<Array<unknown>>,
  totalsRow?: Array<unknown>,
): Content {
  const widths = columns.map(resolveWidth);
  const headerRow = columns.map((c) => ({
    text: c.header,
    style: 'tableHeader',
    alignment: c.numeric ? 'right' : 'left',
  }));

  const body: Array<Array<unknown>> = [
    headerRow,
    ...rows.map((r) => r.map((cell, i) => toCell(cell, !!columns[i]?.numeric))),
  ];
  if (totalsRow) body.push(totalsRow.map((c, i) => ({
    text: c as string,
    style: 'tableFooter',
    alignment: columns[i]?.numeric ? 'right' : 'left',
  })));

  return {
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: 'yunite',
    margin: [0, 4, 0, 12],
  } as unknown as Content;
}

/** A thin divider rule in the brand green→navy gradient. */
export function divider(): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0, y1: 0, x2: 515, y2: 0,
        lineWidth: 3,
        lineColor: BRAND_COLORS.navy,
      },
    ],
    margin: [0, 4, 0, 8],
  } as unknown as Content;
}

/** Empty-state note (dashed box equivalent). */
export function emptyNote(message: string): Content {
  return { text: message, style: 'bodySmall', margin: [0, 8, 0, 8] } as unknown as Content;
}
