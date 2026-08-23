'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Card, SectionTitle } from '@/components/dashboard/ui';
import type { SupportTicket } from '@/lib/api/types';

interface OrgInfo { name?: string; phone?: string; email?: string; address?: string; }

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'account', label: 'My account' },
  { value: 'savings', label: 'Savings' },
  { value: 'shares', label: 'Shares' },
  { value: 'contributions', label: 'Contributions' },
  { value: 'welfare', label: 'Welfare fund' },
  { value: 'loans', label: 'Loans' },
  { value: 'fines', label: 'Fines' },
  { value: 'documents', label: 'Documents' },
  { value: 'statement', label: 'Statement of account' },
  { value: 'other', label: 'Something else' },
];

const STATUS_STYLES: Record<string, string> = {
  open: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
  in_progress: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  resolved: 'border-green-400/30 bg-green-400/10 text-green-200',
  closed: 'border-white/15 bg-white/[0.04] text-white/50',
};

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SupportPage() {
  const [org, setOrg] = useState<OrgInfo>({});
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [category, setCategory] = useState('account');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SupportTicket | null>(null);

  useEffect(() => {
    fetch('/api/org-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setOrg(d.data); })
      .catch(() => {});
    loadTickets();
  }, []);

  const loadTickets = () => {
    fetch('/api/member/support')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.success) setTickets(d.data || []); })
      .catch(() => setTicketsError('Could not load your previous requests.'));
  };

  const submit = async () => {
    setFormError(null);
    if (subject.trim().length < 3) { setFormError('Please give your request a subject.'); return; }
    if (message.trim().length < 10) { setFormError('Please describe your request (at least 10 characters).'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/member/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSubmitted(data.data as SupportTicket);
        setSubject('');
        setMessage('');
        setCategory('account');
        loadTickets();
      } else {
        setFormError(data?.error || 'Unable to submit your request right now. Please try again shortly.');
      }
    } catch {
      setFormError('Unable to submit your request right now. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Support" subtitle="How to get help with your membership." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Contact the YUNITE office</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Organisation" v={org.name || 'YUNITE Pamoja CBO'} />
            <Row k="Phone" v={org.phone || '—'} />
            <Row k="Email" v={org.email || '—'} />
            <Row k="Address" v={org.address || '—'} />
          </dl>
          <p className="mt-4 text-xs text-white/45">
            The office can help with balance disputes, statement certification, detail updates, and loan enquiries.
          </p>
        </Card>

        <Card>
          <SectionTitle>Common questions</SectionTitle>
          <ul className="space-y-3 text-sm text-white/70">
            <Faq q="Why can't I edit my details here?" a="For your security, profile changes are made through the office to verify identity first." />
            <Faq q="How are my shares calculated?" a="Shares are derived from your savings (approximately 1 share per KES 100 saved). See the Savings & Shares page." />
            <Faq q="Where do I pay contributions?" a="Monthly contributions and welfare deposits are made through the YUNITE office or the official payment channels." />
            <Faq q="How do I apply for a loan?" a="Loan applications are handled by the office for active members in good standing." />
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle>Submit a request</SectionTitle>

        {submitted && (
          <div className="mb-4 rounded-xl border border-green-400/25 bg-green-400/10 px-4 py-3 text-sm text-green-200">
            Your request has been received. Ticket reference:{' '}
            <span className="font-mono font-semibold">{submitted.ticket_reference}</span>.
            The YUNITE office has been notified and will respond — you can track the status below.
          </div>
        )}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm text-white/60">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white outline-none focus:border-green-400/50"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value} className="bg-[#0B2A4A]">{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-white/60">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="e.g. Question about my savings balance"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-green-400/50"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-white/60">Describe your request</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Include any details that will help the office assist you. Your member number is attached automatically."
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-green-400/50"
            />
          </div>

          {formError && (
            <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{formError}</div>
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-white/40">
              Requests go directly to the YUNITE office. For urgent matters, please also call the office.
            </p>
            <button onClick={submit} disabled={submitting} className="btn-primary !py-2.5 text-sm disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <SectionTitle>My requests</SectionTitle>
        {ticketsError && <p className="text-sm text-white/45">{ticketsError}</p>}
        {!ticketsError && tickets.length === 0 && (
          <p className="text-sm text-white/45">You have not submitted any requests yet.</p>
        )}
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-white">{t.subject}</div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[t.status] || STATUS_STYLES.open}`}>
                  {statusLabel(t.status)}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/45">
                <span className="font-mono">{t.ticket_reference}</span> · {t.category} · {new Date(t.created_at).toLocaleString()}
              </div>
              {t.admin_response && (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
                  <span className="font-medium text-white/85">Response from the office: </span>
                  {t.admin_response}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-white/50">{k}</dt>
      <dd className="font-medium text-white">{v}</dd>
    </div>
  );
}
function Faq({ q, a }: { q: string; a: string }) {
  return (
    <li>
      <div className="font-medium text-white/85">{q}</div>
      <div className="mt-0.5 text-white/55">{a}</div>
    </li>
  );
}
