/**
 * Period resolution for report generation.
 * Maps a friendly date-range key to a concrete ReportPeriod.
 */

import { ReportPeriod } from './report-data.service';

export type DateRangeKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_year'
  | 'all_time';

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function resolvePeriod(key: DateRangeKey | string): ReportPeriod {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end: now, label: `Today (${fmt(start)})` };
    }
    case 'this_week': {
      const day = now.getDay() || 7; // Monday = 1
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(now.getDate() - (day - 1));
      return { start, end: now, label: `This week (from ${fmt(start)})` };
    }
    case 'this_month': {
      const start = new Date(y, m, 1);
      return { start, end: now, label: `This month (${fmt(start)})` };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);
      return { start, end, label: `Last month (${fmt(start)} – ${fmt(end)})` };
    }
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3;
      const start = new Date(y, qStart, 1);
      return { start, end: now, label: `This quarter (from ${fmt(start)})` };
    }
    case 'this_year': {
      const start = new Date(y, 0, 1);
      return { start, end: now, label: `This year (${y})` };
    }
    case 'last_year': {
      const start = new Date(y - 1, 0, 1);
      const end = new Date(y - 1, 11, 31, 23, 59, 59);
      return { start, end, label: `Last year (${y - 1})` };
    }
    case 'all_time':
    default: {
      const start = new Date(2020, 0, 1);
      return { start, end: now, label: `All time (to ${fmt(now)})` };
    }
  }
}
