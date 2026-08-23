/**
 * Static content helpers for the home page.
 * Motivational quotes and organization messages rotate by day (deterministic).
 */

export const MOTIVATIONAL: { label: string; text: string }[] = [
  { label: 'Save today, thrive tomorrow', text: 'Small, steady savings build the foundation of lasting prosperity.' },
  { label: 'Together we grow', text: 'When we pool our resources, we unlock opportunities no one could reach alone.' },
  { label: 'Discipline is wealth', text: 'Consistent contributions today become the loans and welfare of tomorrow.' },
  { label: 'A dignified safety net', text: 'Your welfare contributions protect every member when it matters most.' },
  { label: 'Knowledge is leverage', text: 'An informed member makes better financial decisions — check your account often.' },
  { label: 'Trust is our currency', text: 'Transparent, member-owned finance is the heart of a strong CBO.' },
  { label: 'Build your share', text: 'Every savings deposit grows your shares — and your voice in the organisation.' },
];

export const ORG_MESSAGES: string[] = [
  'Karibu! We are glad to have you as a member of YUNITE Pamoja CBO. Keep your savings regular and your contributions on time — that is how we lift each other.',
  'Reminder: monthly contributions and welfare deposits are due at the end of the month. Pay early to stay in good standing.',
  'Need a loan? Active members in good standing can apply through the office. Your savings history determines your eligibility.',
  'Annual general meetings are where your voice counts. Attend, vote, and help shape the direction of our organisation.',
  'Thank you for being part of YUNITE Pamoja CBO. Together we are building a stronger, more financially resilient community.',
];

/**
 * Meeting date/time formatting.
 *
 * meetings.start_time is TIMESTAMPTZ (migration 004), so the API returns a
 * full ISO datetime — NOT a bare "HH:MM". This page is server-rendered, so
 * all formatting is pinned to the organisation's timezone (Africa/Nairobi)
 * instead of the server's, keeping the shown time identical to what the
 * office set in the dashboard.
 */
const ORG_TIME_ZONE = 'Africa/Nairobi';
const TZ_LABEL = 'EAT';

export interface MeetingWhen {
  day: string;
  month: string;
  year: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string | null;
}

function formatInOrgZone(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-KE', { timeZone: ORG_TIME_ZONE, ...opts }).format(d);
}

function to12h(hh: number, mm: string): string {
  const suffix = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${mm} ${suffix}`;
}

export function getMeetingWhen(m: { scheduled_date: string; start_time?: string | null }): MeetingWhen {
  const d = new Date(m.scheduled_date);
  const valid = !isNaN(d.getTime());
  const fallback = { day: '--', month: '---', year: '----', weekday: '', dateLabel: m.scheduled_date, timeLabel: null };
  if (!valid) return fallback;

  let timeLabel: string | null = null;
  if (m.start_time) {
    const t = String(m.start_time).trim();
    const bare = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (bare) {
      // Bare wall-clock time: already in the organisation's timezone.
      timeLabel = `${to12h(+bare[1], bare[2])} ${TZ_LABEL}`;
    } else {
      const td = new Date(t);
      if (!isNaN(td.getTime())) {
        const raw = formatInOrgZone(td, { hour: 'numeric', minute: '2-digit', hour12: true })
          .replace(/(am|pm)$/i, (s) => s.toUpperCase());
        timeLabel = `${raw} ${TZ_LABEL}`;
      }
    }
  }

  return {
    day: formatInOrgZone(d, { day: 'numeric' }),
    month: formatInOrgZone(d, { month: 'short' }),
    year: formatInOrgZone(d, { year: 'numeric' }),
    weekday: formatInOrgZone(d, { weekday: 'long' }),
    dateLabel: formatInOrgZone(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    timeLabel,
  };
}
