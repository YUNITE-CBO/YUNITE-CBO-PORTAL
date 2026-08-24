import { getUpcomingMeetings, getOrganizationSettings } from '@/lib/api/meeting.service';
import LiveClock from '@/components/LiveClock';
import { MemberAccessCard } from '@/components/MemberAccessCard';
import { BankAccountCard } from '@/components/BankAccountCard';
import { BankAnnouncementBanner } from '@/components/BankAnnouncementBanner';
import { MOTIVATIONAL, ORG_MESSAGES, getMeetingWhen } from '@/lib/home-content';

export default async function Home() {
  const [meetings, settings] = await Promise.all([getUpcomingMeetings(), getOrganizationSettings()]);

  const orgName = settings['organization.name'] || 'YUNITE Pamoja CBO';
  const orgPhone = settings['organization.phone'];
  const orgEmail = settings['organization.email'];
  const meetingsAvailable = meetings !== null && meetings.length > 0;
  const meetingsDisabled = meetings === null;

  const motivation = MOTIVATIONAL[new Date().getDay() % MOTIVATIONAL.length];
  const orgMessage = ORG_MESSAGES[new Date().getDate() % ORG_MESSAGES.length];

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-6xl px-4 pb-20 sm:px-6">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="text-lg font-extrabold leading-none text-white">{orgName}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-brand-green-soft">Member Portal</div>
          </div>
        </div>
        <LiveClock />
      </header>

      {/* Floating bank announcement — first thing every visitor sees */}
      <BankAnnouncementBanner />

      {/* Hero */}
      <section className="mt-2 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="animate-fade-in-up">
          <span className="pill bg-brand-green/15 text-brand-green-soft ring-1 ring-brand-green/30">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-green animate-pulse-soft" /> Secure member access
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Your CBO account,
            <span className="block bg-gradient-to-r from-brand-green-soft to-brand-green bg-clip-text text-transparent">
              at your fingertips.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70">
            Verify your membership in seconds and view your savings, shares, contributions, loans,
            fines, statements, and notifications — securely, anytime.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#access" className="btn-primary">
              Access my member account
              <span aria-hidden>→</span>
            </a>
            <a href="#about" className="btn-ghost">What is a CBO?</a>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/55">
            <span>✓ Bank-grade session security</span>
            <span>✓ Real-time balances</span>
            <span>✓ Official statements</span>
          </div>
        </div>

        {/* Meetings + org message card */}
        <div className="animate-slide-in flex flex-col gap-4">
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Upcoming meetings</h2>
              <span className="text-xs text-white/40">YUNITE</span>
            </div>
            {meetingsDisabled ? (
              <MeetingsUnavailable />
            ) : meetingsAvailable ? (
              <ul className="space-y-3">
                {meetings!.slice(0, 3).map((m) => {
                  const when = getMeetingWhen(m);
                  return (
                    <li key={m.id} className="flex items-stretch gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      {/* Calendar-style date badge */}
                      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-green/15 py-2 ring-1 ring-brand-green/30">
                        <span className="text-2xl font-extrabold leading-none text-brand-green-soft">{when.day}</span>
                        <span className="mt-1 text-[11px] font-bold uppercase tracking-widest text-brand-green-soft/90">{when.month}</span>
                        <span className="text-[10px] font-medium text-white/50">{when.year}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">{m.meeting_title}</div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                          <ClockIcon />
                          <span className="font-semibold text-white/85">{when.weekday}</span>
                          {when.timeLabel && (
                            <span className="rounded-md bg-brand-green/15 px-1.5 py-0.5 font-bold text-brand-green-soft ring-1 ring-brand-green/30">
                              {when.timeLabel}
                            </span>
                          )}
                        </div>
                        {m.venue && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-white/55">
                            <PinIcon />
                            <span className="truncate">{m.venue}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm text-white/55">
                No upcoming meetings are scheduled right now. Check back soon.
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">A message from YUNITE</h2>
            <p className="text-sm leading-relaxed text-white/80">{orgMessage}</p>
            {(orgPhone || orgEmail) && (
              <div className="mt-3 text-xs text-white/50">
                Contact: {orgEmail ? <span className="text-white/70">{orgEmail}</span> : null}
                {orgEmail && orgPhone ? ' · ' : ''}
                {orgPhone ? <span className="text-white/70">{orgPhone}</span> : null}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Motivational strip */}
      <section className="mt-8 animate-fade-in">
        <div className="card flex flex-col items-center gap-2 px-6 py-5 text-center">
          <p className="text-base font-medium text-white/85">“{motivation.text}”</p>
          <p className="text-xs uppercase tracking-[0.16em] text-brand-green-soft">{motivation.label}</p>
        </div>
      </section>

      {/* Official bank account details (anchor target of the top banner) */}
      <section id="bank-details" className="mt-10 grid scroll-mt-6 gap-6 lg:grid-cols-2 lg:items-start">
        <BankAccountCard />
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">To every member, leader, supporter &amp; friend</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            It is an honour to have you as part of the YUNITE PAMOJA family. ❤️
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Together, we build. Together, we grow.
          </p>
          <p className="mt-3 bg-gradient-to-r from-brand-green-soft to-brand-green bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
            WE ARE YUNITE PAMOJA. 💙
          </p>
        </div>
      </section>

      {/* Access section */}
      <section id="access" className="mt-10 scroll-mt-6">
        <MemberAccessCard />
      </section>

      {/* About CBO */}
      <AboutCbo />

      <footer className="mt-14 border-t border-white/10 pt-6 text-center text-xs text-white/40">
        <p>
          © {new Date().getFullYear()} {orgName}. Member Portal. Data sourced live from YUNITE systems.
        </p>
      </footer>
    </main>
  );
}

function MeetingsUnavailable() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm text-white/55">
      Upcoming meeting details will appear here once the YUNITE meetings service
      is connected to the member portal.
    </div>
  );
}

function AboutCbo() {
  return (
    <section id="about" className="mt-14 grid gap-4 sm:grid-cols-3">
      {[
        {
          icon: '🏦',
          title: 'What is a CBO?',
          body: 'A Community-Based Organisation (CBO) is a member-owned, member-driven group that pools savings and extends affordable credit to its members.',
        },
        {
          icon: '🌱',
          title: 'Why join?',
          body: 'Members save together, access low-interest loans, build welfare safety nets, and grow shares — strengthening financial resilience.',
        },
        {
          icon: '🛡️',
          title: 'Your data is safe',
          body: 'This portal only displays your own account, secured by a short-lived signed session. Your details are never exposed to other members.',
        },
      ].map((c) => (
        <div key={c.title} className="card">
          <div className="text-2xl">{c.icon}</div>
          <h3 className="mt-2 font-semibold text-white">{c.title}</h3>
          <p className="mt-1 text-sm text-white/60">{c.body}</p>
        </div>
      ))}
    </section>
  );
}

function BrandMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-green to-brand-green-soft shadow-[0_6px_20px_-6px_rgba(34,197,94,0.6)]">
      <span className="text-lg font-extrabold text-brand-navy">Y</span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="shrink-0 text-brand-green-soft" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
