'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface MemberSummary {
  first_name: string;
  last_name: string;
  member_number: string;
  status: string;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/member/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!alive) return;
        const m = d?.data?.member;
        if (m) setMember({ first_name: m.first_name, last_name: m.last_name, member_number: m.member_number, status: m.status });
      })
      .catch(() => {
        if (!alive) return;
        // session likely expired → bounce home
        router.replace('/#access');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [router]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/');
    }
  }

  const nav = [
    { href: '/dashboard', label: 'Overview', icon: 'home' },
    { href: '/dashboard/savings', label: 'Savings & Shares', icon: 'wallet' },
    { href: '/dashboard/contributions', label: 'Contributions', icon: 'piggy' },
    { href: '/dashboard/welfare', label: 'Welfare', icon: 'heart' },
    { href: '/dashboard/loans', label: 'Loans', icon: 'bank' },
    { href: '/dashboard/fines', label: 'Fines', icon: 'alert' },
    { href: '/dashboard/transactions', label: 'Transactions', icon: 'list' },
    { href: '/dashboard/statement', label: 'Statement', icon: 'doc' },
    { href: '/dashboard/notifications', label: 'Notifications', icon: 'bell' },
    { href: '/dashboard/profile', label: 'My Profile', icon: 'user' },
    { href: '/dashboard/support', label: 'Support', icon: 'help' },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-green to-brand-green-soft">
            <span className="text-base font-extrabold text-brand-navy">Y</span>
          </div>
          <div>
            <div className="text-sm font-bold leading-none text-white">YUNITE Member Portal</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-brand-green-soft">My Account</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-white">
              {loading ? '—' : member ? `${member.first_name} ${member.last_name}` : 'Member'}
            </div>
            <div className="text-xs text-white/50">{member ? member.member_number : ''}</div>
          </div>
          <button onClick={logout} className="btn-ghost !px-4 !py-2 text-sm" disabled={loggingOut}>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <button
            className="btn-ghost !px-3 !py-2 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <MenuIcon />
          </button>
        </div>
      </header>

      <div className="mt-2 grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside className={`${open ? 'block' : 'hidden'} lg:block`}>
          <nav className="card sticky top-4 p-2">
            <ul className="space-y-1">
              {nav.map((n) => (
                <li key={n.href}>
                  <NavLink href={n.href} icon={n.icon} label={n.label} onClick={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon, onClick }: { href: string; label: string; icon: string; onClick: () => void }) {
  const pathname = usePathname();
  const active = href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active ? 'bg-brand-green/15 font-semibold text-brand-green-soft' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      <NavIcon name={icon} />
      {label}
    </Link>
  );
}

function NavIcon({ name }: { name: string }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home': return (<svg {...p}><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>);
    case 'wallet': return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H5a2 2 0 0 0-2 2z"/><path d="M21 9v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"/><circle cx="17" cy="13" r="1.2"/></svg>);
    case 'piggy': return (<svg {...p}><path d="M19 9a7 7 0 0 0-14 0H3v3h2a5 5 0 0 0 1 3l-1 2h3l.5-1a7 7 0 0 0 5 0l.5 1h3l-1-2a5 5 0 0 0 1-3h2v-3z"/><circle cx="15" cy="9" r="0.8"/></svg>);
    case 'heart': return (<svg {...p}><path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>);
    case 'bank': return (<svg {...p}><path d="M3 21h18M5 21V10M19 21V10M3 10l9-6 9 6M9 21v-7M15 21v-7"/></svg>);
    case 'alert': return (<svg {...p}><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5M12 17.5v.5"/></svg>);
    case 'list': return (<svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>);
    case 'doc': return (<svg {...p}><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M8 13h8M8 17h6"/></svg>);
    case 'bell': return (<svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.5 21a2 2 0 0 1-3 0"/></svg>);
    case 'user': return (<svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>);
    case 'help': return (<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1 1-1 1.7M12 17h.01"/></svg>);
    default: return null;
  }
}

function MenuIcon() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>);
}
