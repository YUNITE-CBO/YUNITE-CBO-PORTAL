'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FieldState {
  phone: string;
  idNumber: string;
  firstName: string;
}

const EMPTY: FieldState = { phone: '', idNumber: '', firstName: '' };

export function MemberAccessCard() {
  const router = useRouter();
  const [values, setValues] = useState<FieldState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FieldState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || 'We could not verify those details. Please try again.');
        setLoading(false);
        return;
      }
      // Server set the cookie; navigate to the dashboard.
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="glass-strong mx-auto w-full max-w-md p-6 sm:p-7">
      <div className="mb-4 flex items-center gap-2">
        <LockIcon />
        <h2 className="text-lg font-bold text-white">Access my member account</h2>
      </div>
      <p className="mb-5 text-sm text-white/60">
        Enter the three details on file with YUNITE. We match them against your registered membership —
        no password is required.
      </p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="firstName">First name</label>
          <input
            id="firstName" name="firstName" type="text" autoComplete="given-name"
            className="input" placeholder="e.g. Stephen"
            value={values.firstName} onChange={set('firstName')} required disabled={loading}
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone number</label>
          <input
            id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel"
            className="input" placeholder="e.g. 0712345678"
            value={values.phone} onChange={set('phone')} required disabled={loading}
          />
        </div>
        <div>
          <label className="label" htmlFor="idNumber">ID / National ID number</label>
          <input
            id="idNumber" name="idNumber" type="text" autoComplete="off"
            className="input" placeholder="e.g. 12345678"
            value={values.idNumber} onChange={set('idNumber')} required disabled={loading}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? (
            <>
              <Spinner /> Verifying…
            </>
          ) : (
            <>Verify &amp; continue →</>
          )}
        </button>
      </form>

      <p className="mt-4 flex items-start gap-2 text-xs text-white/45">
        <ShieldIcon />
        <span>
          Your details are verified securely and never shared. A signed, short-lived session
          protects your account — always log out on shared devices.
        </span>
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
