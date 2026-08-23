/**
 * Meeting time normalization (meetings.service.ts).
 *
 * Regression: the meetings form sent start_time/end_time as bare "HH:MM"
 * strings, but the columns are TIMESTAMPTZ (migration 004). Postgres
 * rejected the insert ("invalid input syntax for type timestamp with time
 * zone") and meeting creation 500'd with "Failed to create meeting".
 */

import { normalizeMeetingTime } from '@/lib/services/meetings.service';

export {};

describe('normalizeMeetingTime', () => {
  const SCHEDULED = '2026-08-30T11:30:00.000Z';

  it('returns null for empty values', () => {
    expect(normalizeMeetingTime(SCHEDULED, null)).toBeNull();
    expect(normalizeMeetingTime(SCHEDULED, undefined)).toBeNull();
    expect(normalizeMeetingTime(SCHEDULED, '')).toBeNull();
    expect(normalizeMeetingTime(SCHEDULED, '   ')).toBeNull();
  });

  it('anchors a bare HH:MM on the scheduled date', () => {
    const result = normalizeMeetingTime(SCHEDULED, '14:30');
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(isNaN(d.getTime())).toBe(false);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
    expect(result!.startsWith('2026-08-30')).toBe(true);
  });

  it('accepts HH:MM:SS and single-digit hours', () => {
    expect(new Date(normalizeMeetingTime(SCHEDULED, '9:05:15')!).getUTCHours()).toBe(9);
    expect(new Date(normalizeMeetingTime(SCHEDULED, '09:05:15')!).getUTCSeconds()).toBe(15);
  });

  it('passes full ISO datetimes through as valid ISO', () => {
    const iso = '2026-08-30T14:30:00.000Z';
    expect(normalizeMeetingTime(SCHEDULED, iso)).toBe(iso);
  });

  it('returns null for unparseable values instead of throwing', () => {
    expect(normalizeMeetingTime(SCHEDULED, 'not-a-time')).toBeNull();
    expect(normalizeMeetingTime(SCHEDULED, '2026-13-99T99:99')).toBeNull();
    expect(normalizeMeetingTime(undefined, '14:30')).toBeNull();
  });
});
