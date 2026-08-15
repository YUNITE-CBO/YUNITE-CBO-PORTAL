/**
 * Table layout regression tests.
 *
 * Guards against the defect where pdfmake tables overflowed the A4 page
 * because every column defaulted to 'auto' (sized to content). Numeric columns
 * must resolve to a compact fixed width and text columns to '*' (bounded by the
 * page), so a table can never exceed the usable page width regardless of how
 * many columns or how long the cell text.
 */
import { buildTable } from '@/modules/documents/utils/tables';

const PORTRAIT_USABLE_WIDTH = 515; // A4 (595pt) − [40,40] margins ≈ 515pt

describe('buildTable column-width resolution (no page overflow)', () => {
  test('numeric columns get a compact fixed width; text columns get "*"', () => {
    const node = buildTable(
      [
        { header: 'Date' },
        { header: 'Ref' },
        { header: 'Description' },
        { header: 'Reference' },
        { header: 'Debit', numeric: true },
        { header: 'Credit', numeric: true },
        { header: 'Balance', numeric: true },
      ],
      [['2026-08-04', 'TXN-20260804-SDP-c19870b6', 'savings_deposit', '—', 0, 300, 300]],
    ) as any;
    const widths: Array<number | string> = node.table.widths;
    // 7 columns, 3 numeric → fixed numbers; 4 text → '*'.
    expect(widths.filter((w) => w === '*')).toHaveLength(4);
    expect(widths.filter((w) => typeof w === 'number')).toHaveLength(3);
    // No column left as 'auto' (the old overflow-causing default).
    expect(widths.filter((w) => w === 'auto')).toHaveLength(0);
    // Fixed numeric widths must each be a sane fraction of the page.
    for (const w of widths.filter((x) => typeof x === 'number') as number[]) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(PORTRAIT_USABLE_WIDTH);
    }
  });

  test('explicit widths are honored (not overridden)', () => {
    const node = buildTable(
      [
        { header: 'A', width: 80 },
        { header: 'B', width: '*' },
        { header: 'C', width: 'auto' },
      ],
      [['x', 'y', 'z']],
    ) as any;
    expect(node.table.widths).toEqual([80, '*', 'auto']);
  });

  test('all-numeric table still resolves to fixed widths (no "auto")', () => {
    const node = buildTable(
      [
        { header: 'Principal', numeric: true },
        { header: 'Total', numeric: true },
        { header: 'Paid', numeric: true },
        { header: 'Due', numeric: true },
      ],
      [[100, 120, 20, 100]],
    ) as any;
    expect(node.table.widths.every((w: any) => typeof w === 'number')).toBe(true);
  });

  test('long unbreakable refs are made wrappable (zero-width breaks injected)', () => {
    const longRef = 'TXN-20260804-SDP-c19870b6';
    const node = buildTable(
      [{ header: 'Ref' }, { header: 'Debit', numeric: true }],
      [[longRef, 300]],
    ) as any;
    const cellText = node.table.body[1][0].text as string;
    // The raw ref has no zero-width spaces; the wrapped version does.
    expect(longRef.includes('\u200B')).toBe(false);
    expect(cellText.includes('\u200B')).toBe(true);
    // And it still contains the original characters in order.
    expect(cellText.replace(/\u200B/g, '')).toBe(longRef);
  });

  test('short strings pass through unwrapped', () => {
    const node = buildTable(
      [{ header: 'Status' }],
      [['active']],
    ) as any;
    expect(node.table.body[1][0].text).toBe('active');
  });

  test('null/undefined/empty cells render as "—" not blank', () => {
    const node = buildTable(
      [{ header: 'Ref' }, { header: 'Debit', numeric: true }],
      [[null, undefined]],
    ) as any;
    expect(node.table.body[1][0].text).toBe('—');
    expect(node.table.body[1][1].text).toBe('—');
  });

  test('dontBreakRows is set so a row never splits across a page boundary', () => {
    const node = buildTable([{ header: 'A' }], [['x']]) as any;
    expect(node.table.dontBreakRows).toBe(true);
    expect(node.table.headerRows).toBe(1);
  });
});
