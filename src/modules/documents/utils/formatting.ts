/**
 * Formatting helpers for the YUNITE Document Engine.
 *
 * Thin wrappers over the brand formatters so templates have a single import
 * surface and money/date formatting is consistent across every document.
 */

import { formatMoney, formatDate, formatDateTime } from '@/lib/services/reports/brand';

export { formatMoney, formatDate, formatDateTime };

/** Safe string for table cells: null/undefined → '—'. */
export function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/** Money formatted for a numeric cell; non-finite → '—'. */
export function money(amount: unknown, currency?: string): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '—';
  return formatMoney(n, currency);
}

/** Signed money (e.g. for net totals): +KES 1,500.00 / -KES 200.00. */
export function signedMoney(amount: number, currency?: string): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

/** Title-case a snake_case label (e.g. 'savings_deposit' → 'Savings Deposit'). */
export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Uppercase a severity for badges. */
export function severityLabel(sev: string): string {
  return (sev || 'info').toUpperCase();
}

/** Pick the pdfmake style name for a severity. */
export function severityStyle(sev: string): string {
  const s = (sev || 'info').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  return 'info';
}
