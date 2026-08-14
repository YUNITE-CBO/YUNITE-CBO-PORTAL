/**
 * Static content helpers for the home page.
 * Motivational quotes and organization messages rotate by day (deterministic).
 */
import type { Meeting } from '@/lib/api/types';

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

export function formatMeetingDate(m: { scheduled_date: string; start_time?: string | null }): string {
  try {
    const d = new Date(m.scheduled_date);
    const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    let time = '';
    if (m.start_time) {
      const [hh, mm] = m.start_time.split(':');
      if (hh && mm) time = ` · ${hh}:${mm}`;
    }
    return `${day}${time}`;
  } catch {
    return m.scheduled_date;
  }
}
