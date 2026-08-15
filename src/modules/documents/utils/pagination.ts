/**
 * Pagination helpers for the YUNITE Document Engine.
 *
 * pdfmake paginates long tables automatically (the body flows across pages
 * and the header row repeats because `headerRows: 1` is set in `buildTable`).
 * These helpers chunk very large datasets when a template wants explicit
 * control over page breaks between sections, and provide a row-limit guard
 * so a runaway query can never produce an unbounded document.
 */

/** Maximum rows rendered in a single table before truncation with a note. */
export const MAX_ROWS_PER_TABLE = 2000;

/**
 * Truncate a row array to MAX_ROWS_PER_TABLE, returning the (possibly
 * truncated) rows and a flag. The caller appends a truncation note when true.
 */
export function capRows<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length <= MAX_ROWS_PER_TABLE) return { rows, truncated: false };
  return { rows: rows.slice(0, MAX_ROWS_PER_TABLE), truncated: true };
}

/**
 * Split a flat array into chunks of `size`. Useful when a template renders
 * groups of transactions on separate pages.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
