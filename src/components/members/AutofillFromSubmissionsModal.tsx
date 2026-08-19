'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Auto-fill helper for the existing Register Member form.
 *
 * Lists pending pre-registration submissions (from the public /register/member
 * form). An admin searches, selects an applicant, and clicks Auto-fill — the
 * existing registration form is populated with the submitted information. The
 * admin still reviews/edits and clicks the EXISTING "Register Member" button,
 * which runs the existing registration engine.
 *
 * Registered submissions are excluded from the list by the backend (default
 * queue view hides registered status).
 */

export interface SubmissionRow {
  id: string;
  submission_reference: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  id_number: string | null;
  status: string;
  intent?: 'register' | 'update';
  existing_member_id?: string | null;
  duplicate_flagged: boolean;
  duplicate_match: Record<string, { member_id: string; member_number: string; name: string }> | null;
  created_at: string;
  registered_member_number: string | null;
}

export interface AutofillData {
  submission_id: string;
  submission_reference: string;
  fields: Record<string, string>;
  duplicate_match: Record<string, { member_id: string; member_number: string; name: string }> | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAutofill: (data: AutofillData) => void;
  /** Called after an update-intent submission was applied to its member. */
  onUpdateApplied?: (info: { member_number: string; submission_reference: string }) => void;
}

export default function AutofillFromSubmissionsModal({ open, onClose, onAutofill, onUpdateApplied }: Props) {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  /** Apply an update-intent submission to its linked existing member. */
  const handleApplyUpdate = async () => {
    const sub = submissions.find((s) => s.id === selectedId);
    if (!sub) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/member-registration-submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      });
      const data = await res.json();
      if (data.success) {
        onClose();
        onUpdateApplied?.({
          member_number: data.data?.member_number || '',
          submission_reference: sub.submission_reference,
        });
      } else {
        setError(data.error || 'Failed to apply update');
      }
    } catch {
      setError('Failed to apply update');
    } finally {
      setApplying(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search.trim()) params.set('query', search.trim());
      const res = await fetch(`/api/member-registration-submissions?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.data || []);
      } else {
        setError(data.error || 'Failed to load submissions');
      }
    } catch {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSearch('');
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!open) return null;

  const handleAutofill = () => {
    const sub = submissions.find((s) => s.id === selectedId);
    if (!sub) return;

    // Default every field to '' so the form's controlled inputs stay happy.
    const fields: Record<string, string> = {
      first_name: sub.first_name || '',
      last_name: sub.last_name || '',
      email: sub.email || '',
      phone: sub.phone || '',
      alt_phone: '',
      alt_email: '',
      id_number: sub.id_number || '',
      kra_pin: '',
      date_of_birth: '',
      gender: 'male',
      marital_status: '',
      nationality: '',
      physical_address: '',
      postal_address: '',
      occupation: '',
      employer: '',
      employer_address: '',
      next_of_kin_name: '',
      next_of_kin_phone: '',
      next_of_kin_relationship: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      emergency_contact_relationship: '',
    };

    // The list endpoint only carries top-level columns. Fetch the full record
    // so every captured field (incl. submitted_data) is auto-filled. The
    // original submission record is preserved server-side regardless of edits.
    fetch(`/api/member-registration-submissions/${sub.id}`)
      .then((r) => r.json())
      .then((data) => {
        let duplicate_match = sub.duplicate_match || null;
        if (data.success && data.data) {
          const full = data.data;
          Object.keys(fields).forEach((k) => {
            if (full[k] !== undefined && full[k] !== null) {
              fields[k] = String(full[k]);
            }
          });
          // submitted_data is the canonical original payload.
          if (full.submitted_data) {
            Object.keys(fields).forEach((k) => {
              const v = full.submitted_data[k];
              if (v !== undefined && v !== null && v !== '') {
                fields[k] = String(v);
              }
            });
          }
          duplicate_match = full.duplicate_match || duplicate_match;
        }
        onAutofill({
          submission_id: sub.id,
          submission_reference: sub.submission_reference,
          fields,
          duplicate_match,
        });
      })
      .catch(() => {
        onAutofill({
          submission_id: sub.id,
          submission_reference: sub.submission_reference,
          fields,
          duplicate_match: sub.duplicate_match || null,
        });
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Auto-fill from Submitted Registrations</h2>
            <p className="text-sm text-gray-500">
              Select an applicant to populate the registration form. You will still review and click Register Member.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="border-b px-6 py-3">
          <input
            type="text"
            placeholder="Search by name, ID number, phone, email, or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading submissions...</div>
          ) : error ? (
            <div className="text-center text-red-600 py-8">{error}</div>
          ) : submissions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <span className="text-4xl">📋</span>
              <p className="mt-2">No pending submissions{search ? ' match your search' : ''}.</p>
              <p className="text-xs mt-1">
                Share the public registration link so prospective members can submit their information.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {submissions.map((s) => {
                const selected = selectedId === s.id;
                const dupes = s.duplicate_match || {};
                const dupeEntries = Object.entries(dupes);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {s.first_name} {s.last_name}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {s.phone}
                            {s.email ? ` · ${s.email}` : ''}
                            {s.id_number ? ` · ID ${s.id_number}` : ''}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {s.submission_reference} · Submitted {new Date(s.created_at).toLocaleDateString('en-KE')}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {s.intent === 'update' ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Update request
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Waiting
                            </span>
                          )}
                          {dupeEntries.length > 0 && s.intent !== 'update' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              Possible duplicate
                            </span>
                          )}
                        </div>
                      </div>
                      {s.intent === 'update' && (
                        <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                          ✎ This applicant identified an EXISTING record — applying this submission
                          updates member
                          {' '}<strong>{dupeEntries[0]?.[1]?.member_number || ''}</strong>
                          {s.existing_member_id && (
                            <a
                              href={`/dashboard/members/${s.existing_member_id}`}
                              className="ml-2 underline font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View member →
                            </a>
                          )}
                          {' '}with the submitted changes (no new profile is created).
                        </div>
                      )}
                      {dupeEntries.length > 0 && s.intent !== 'update' && (
                        <div className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                          ⚠ An existing member may match:
                          {dupeEntries.map(([field, m]) => (
                            <span key={field} className="ml-2">
                              <strong>{field.replace('_', ' ')}:</strong> {m.name} ({m.member_number})
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          {selectedId && submissions.find((s) => s.id === selectedId)?.intent === 'update' ? (
            <button
              type="button"
              disabled={applying}
              onClick={handleApplyUpdate}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply Update to Member'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!selectedId}
              onClick={handleAutofill}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              Auto-fill
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
