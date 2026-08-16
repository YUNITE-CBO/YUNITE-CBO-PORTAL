'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface Meeting {
  id: string;
  meeting_number: string;
  meeting_title: string;
  meeting_type?: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  agenda?: string | null;
  chairperson?: string | null;
  secretary?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const MEETING_TYPES = ['general', 'agm', 'egm', 'committee', 'board'];

export default function MeetingsPage() {
  const { isAdmin } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    meeting_title: '',
    meeting_type: 'general',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    venue: '',
    agenda: '',
  });

  useEffect(() => { fetchMeetings(); }, [filter]);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings?upcoming=${filter === 'upcoming' ? 'true' : 'false'}`);
      const data = await res.json();
      if (data.success) setMeetings(data.data || []);
      else setError(data.error || 'Failed to fetch meetings');
    } catch { setError('Failed to fetch meetings'); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setForm({ meeting_title: '', meeting_type: 'general', scheduled_date: '', start_time: '', end_time: '', venue: '', agenda: '' });
    setShowModal(true);
  };

  const openEdit = (m: Meeting) => {
    setEditing(m);
    setFormError(null);
    const d = m.scheduled_date ? new Date(m.scheduled_date) : new Date();
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setForm({
      meeting_title: m.meeting_title,
      meeting_type: m.meeting_type || 'general',
      scheduled_date: isoDate,
      start_time: m.start_time || '',
      end_time: m.end_time || '',
      venue: m.venue || '',
      agenda: m.agenda || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.meeting_title || !form.scheduled_date) { setFormError('Title and date are required'); return; }
    setSubmitting(true); setFormError(null);
    try {
      const isoScheduled = form.start_time
        ? new Date(`${form.scheduled_date}T${form.start_time}`).toISOString()
        : new Date(`${form.scheduled_date}T00:00:00`).toISOString();
      const body = {
        meeting_title: form.meeting_title,
        meeting_type: form.meeting_type,
        scheduled_date: isoScheduled,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        venue: form.venue || null,
        agenda: form.agenda || null,
      };
      const res = editing
        ? await fetch(`/api/meetings/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) { setShowModal(false); fetchMeetings(); }
      else setFormError(data.error || 'Failed to save meeting');
    } catch { setFormError('Failed to save meeting'); }
    finally { setSubmitting(false); }
  };

  const cancelMeeting = async (m: Meeting) => {
    if (!confirm(`Cancel "${m.meeting_title}"? Members will be notified.`)) return;
    try {
      const res = await fetch(`/api/meetings/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
      const data = await res.json();
      if (data.success) fetchMeetings();
      else alert(data.error || 'Failed to cancel');
    } catch { alert('Failed to cancel meeting'); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
  const formatTime = (t?: string | null) => t ? new Date(`1970-01-01T${t}`).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : null;

  const statusColor = (s: string) => ({
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }[s] || 'bg-gray-100 text-gray-800');

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900">Meetings</h1>
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">Admin access is required to manage meetings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Meetings</h1>
          <p className="text-gray-500 mt-1">Schedule and manage organization meetings. Members are notified automatically.</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">+ Schedule Meeting</button>
      </div>

      <div className="flex gap-2 mb-6">
        {(['upcoming', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
            {f === 'upcoming' ? 'Upcoming' : 'All Meetings'}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">Loading meetings…</div>
      ) : meetings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">No {filter === 'upcoming' ? 'upcoming ' : ''}meetings. Schedule one to notify members.</div>
      ) : (
        <div className="space-y-4">
          {meetings.map(m => (
            <div key={m.id} className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900">{m.meeting_title}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusColor(m.status)}`}>{m.status}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800 capitalize">{m.meeting_type || 'general'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{m.meeting_number}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                    <div><span className="font-medium text-gray-900">Date:</span> {formatDate(m.scheduled_date)}</div>
                    {m.start_time && <div><span className="font-medium text-gray-900">Start:</span> {formatTime(m.start_time)}</div>}
                    {m.end_time && <div><span className="font-medium text-gray-900">End:</span> {formatTime(m.end_time)}</div>}
                    {m.venue && <div><span className="font-medium text-gray-900">Venue:</span> {m.venue}</div>}
                  </div>
                  {m.agenda && <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{m.agenda}</p>}
                </div>
                <div className="flex gap-2 ml-4">
                  {m.status === 'scheduled' && (
                    <>
                      <button onClick={() => openEdit(m)} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Edit</button>
                      <button onClick={() => cancelMeeting(m)} className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Cancel</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">{editing ? 'Edit Meeting' : 'Schedule Meeting'}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input value={form.meeting_title} onChange={e => setForm({ ...form, meeting_title: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.meeting_type} onChange={e => setForm({ ...form, meeting_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    {MEETING_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                <input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agenda</label>
                <textarea rows={4} value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
