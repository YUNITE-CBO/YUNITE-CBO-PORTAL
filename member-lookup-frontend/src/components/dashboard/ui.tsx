'use client';

import { formatMoney } from '@/lib/format';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/55">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">{children}</h2>;
}

export function StatCard({ label, value, sub, accent = 'green' }: { label: string; value: string; sub?: string; accent?: 'green' | 'navy' | 'gold' | 'red' }) {
  const ring = {
    green: 'from-brand-green/20 to-transparent text-brand-green-soft',
    navy: 'from-sky-500/20 to-transparent text-sky-300',
    gold: 'from-amber-400/20 to-transparent text-amber-300',
    red: 'from-red-500/20 to-transparent text-red-300',
  }[accent];
  return (
    <div className="card relative overflow-hidden">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${ring} blur-xl`} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
        <div className="mt-1.5 text-2xl font-extrabold tabular text-white">{value}</div>
        {sub && <div className="mt-1 text-xs text-white/45">{sub}</div>}
      </div>
    </div>
  );
}

export function BalanceRow({ label, amount, currency = 'KES' }: { label: string; amount: number; currency?: string }) {
  const negative = amount < 0;
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-white/70">{label}</span>
      <span className={`font-semibold tabular ${negative ? 'text-red-300' : 'text-white'}`}>{formatMoney(amount, currency)}</span>
    </div>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
      <div className="mb-2 text-3xl">{icon || '📭'}</div>
      <div className="font-semibold text-white/80">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-white/45">{body}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-8 text-center">
      <div className="mb-2 text-2xl">⚠️</div>
      <div className="max-w-sm text-sm text-red-200">{message}</div>
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-4 !py-2 text-sm">Try again</button>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-8 text-white/50">
      <svg className="h-5 w-5 animate-spin text-brand-green" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
}

export function Pill({ status, label }: { status?: string | null; label?: string }) {
  return <span className={`pill ${statusClassFor(status)}`}>{label || prettyStatus(status)}</span>;
}

function prettyStatus(s?: string | null): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function statusClassFor(s?: string | null): string {
  switch ((s || '').toLowerCase()) {
    case 'active': case 'disbursed': case 'approved': return 'status-active';
    case 'pending': return 'status-pending';
    case 'suspended': case 'defaulted': return 'status-suspended';
    case 'completed': return 'status-completed';
    case 'paid': case 'waived': return 'status-completed';
    case 'partial': return 'status-pending';
    default: return 'status-pending';
  }
}
