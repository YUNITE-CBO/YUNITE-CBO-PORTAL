'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface TicketMember {
  member_number: string;
  first_name: string;
  last_name: string;
}

interface SupportTicket {
  id: string;
  ticket_reference: string;
  member_id: string;
  category: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: string;
  source: string;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  member?: TicketMember | null;
}

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-200 text-gray-700',
};

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const isStaff = !!user && ['staff', 'admin', 'super_admin'].includes(user.role);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('open');
  const [editResponse, setEditResponse] = useState('');

  useEffect(() => { fetchTickets(); }, [statusFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/support/tickets${qs}`);
      const data = await res.json();
      if (data.success) setTickets(data.data || []);
      else setError(data.error || 'Failed to fetch support tickets');
    } catch { setError('Failed to fetch support tickets'); }
    finally { setLoading(false); }
  };

  const openTicket = (t: SupportTicket) => {
    setSelected(t);
    setEditStatus(t.status);
    setEditResponse(t.admin_response || '');
    setFormError(null);
  };

  const handleUpdate = async () => {
    if (!selected) return;
    setSubmitting(true); setFormError(null);
    try {
      const res = await fetch(`/api/support/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus, admin_response: editResponse.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        fetchTickets();
      } else {
        setFormError(data.error || data.message || 'Failed to update ticket');
      }
    } catch { setFormError('Failed to update ticket'); }
    finally { setSubmitting(false); }
  };

  if (!isStaff) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
        Support tickets are available to staff members only.
      </div>
    );
  }

  const openCount = tickets.filter((t) => t.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-sm text-gray-500">
            Requests submitted by members through the member portal. {openCount > 0 ? `${openCount} open.` : 'No open tickets.'}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading tickets…</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No support tickets{statusFilter ? ` with status "${statusLabel(statusFilter)}"` : ''} yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Reference</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Member</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Subject</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openTicket(t)}>
                  <td className="px-4 py-3 font-mono text-xs">{t.ticket_reference}</td>
                  <td className="px-4 py-3">
                    {t.member ? `${t.member.first_name} ${t.member.last_name}` : '—'}
                    <span className="block text-xs text-gray-400">{t.member?.member_number}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{t.category}</td>
                  <td className="px-4 py-3">{t.subject}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[t.status] || ''}`}>
                      {statusLabel(t.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.subject}</h2>
                <p className="font-mono text-xs text-gray-500">{selected.ticket_reference} · {selected.category}</p>
                {selected.member && (
                  <p className="text-xs text-gray-500">
                    {selected.member.first_name} {selected.member.last_name} ({selected.member.member_number})
                  </p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-wrap">{selected.message}</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Response to member (optional)</label>
                <textarea
                  value={editResponse}
                  onChange={(e) => setEditResponse(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="This response is sent to the member with the status update."
                />
              </div>
              {formError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setSelected(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
                <button
                  onClick={handleUpdate}
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save & Notify Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
