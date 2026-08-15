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
  const widths = columns.map((c) => c.width ?? 'auto');
  const headerRow = columns.map((c) => ({
    text: c.header,
    style: 'tableHeader',
    alignment: c.numeric ? 'right' : 'left',
  }));

  const body: Array<Array<unknown>> = [headerRow, ...rows];
  if (totalsRow) body.push(totalsRow.map((c, i) => ({
    text: c as string,
    style: 'tableFooter',
    alignment: columns[i]?.numeric ? 'right' : 'left',
  })));

  return {
    table: { headerRows: 1, widths, body },
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
