'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface AutomationRun {
  id: string;
  run_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  trigger: string;
  items_processed: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors_count: number;
  error_message: string | null;
  details: any;
}

interface Alert {
  tier: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
}

const formatDuration = (ms?: number | null) => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export default function AutomationPage() {
  const { isAdmin } = useAuth();
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastTickResult, setLastTickResult] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/runs?limit=30');
      const data = await res.json();
      if (data.success) setRuns(data.data || []);
      else setError(data.error || 'Failed to fetch runs');
    } catch { setError('Failed to fetch automation runs'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRuns(); }, []);

  const runNow = async () => {
    setRunning(true); setError(null);
    try {
      const res = await fetch('/api/automation/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLastTickResult(data.data);
        fetchRuns();
      } else setError(data.error || data.message || 'Tick failed');
    } catch { setError('Failed to trigger automation tick'); }
    finally { setRunning(false); }
  };

  const statusColor = (s: string) => ({
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    skipped: 'bg-gray-100 text-gray-800',
  }[s] || 'bg-gray-100 text-gray-800');

  const alertColor = (t: string) => ({
    critical: 'bg-red-50 border-red-300 text-red-800',
    warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
    info: 'bg-blue-50 border-blue-300 text-blue-800',
  }[t] || 'bg-gray-50 border-gray-300 text-gray-800');

  const stepLabels: Record<string, string> = {
    email_queue: 'Email Queue',
    schedules: 'Due Schedules',
    obligations: 'Obligation Reminders',
    meetings: 'Meeting Reminders',
    statements: 'Statement Cadence',
    forecast: 'Forecast & Alerts',
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900">Automation</h1>
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">Admin access is required to view automation history.</p>
        </div>
      </div>
    );
  }

  const completed = runs.filter(r => r.status === 'completed').length;
  const failed = runs.filter(r => r.status === 'failed').length;
  const totalNotifs = runs.reduce((s, r) => s + (r.notifications_created || 0), 0);
  const totalEmails = runs.reduce((s, r) => s + (r.emails_sent || 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Automation Engine</h1>
          <p className="text-gray-500 mt-1">Workflow automation runs: email queue, scheduled notifications, reminders, statements, and forecasts.</p>
        </div>
        <button onClick={runNow} disabled={running} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {running ? 'Running…' : '▶ Run Now'}
        </button>
      </div>

      {lastTickResult && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-2">✓ Tick completed ({formatDuration(lastTickResult.duration_ms)})</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div><span className="text-gray-600">Items:</span> <span className="font-medium">{lastTickResult.totals?.items_processed ?? 0}</span></div>
            <div><span className="text-gray-600">Notifications:</span> <span className="font-medium">{lastTickResult.totals?.notifications_created ?? 0}</span></div>
            <div><span className="text-gray-600">Emails sent:</span> <span className="font-medium">{lastTickResult.totals?.emails_sent ?? 0}</span></div>
            <div><span className="text-gray-600">Emails skipped:</span> <span className="font-medium">{lastTickResult.totals?.emails_skipped ?? 0}</span></div>
            <div><span className="text-gray-600">Errors:</span> <span className="font-medium">{lastTickResult.totals?.errors_count ?? 0}</span></div>
          </div>
          {lastTickResult.steps && (
            <div className="mt-3 space-y-1">
              {lastTickResult.steps.map((s: any, i: number) => (
                <div key={i} className="text-xs flex justify-between bg-white/60 rounded px-2 py-1">
                  <span>{stepLabels[s.step] || s.step}{s.skipped_reason ? ` (skipped: ${s.skipped_reason})` : ''}</span>
                  <span className="text-gray-500">processed: {s.items_processed} · notifs: {s.notifications_created} · emails: {s.emails_sent}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-5"><div className="text-2xl font-bold text-gray-900">{runs.length}</div><div className="text-sm text-gray-500">Total Runs</div></div>
        <div className="bg-white rounded-xl shadow-sm border p-5"><div className="text-2xl font-bold text-green-600">{completed}</div><div className="text-sm text-gray-500">Completed</div></div>
        <div className="bg-white rounded-xl shadow-sm border p-5"><div className="text-2xl font-bold text-red-600">{failed}</div><div className="text-sm text-gray-500">Failed</div></div>
        <div className="bg-white rounded-xl shadow-sm border p-5"><div className="text-2xl font-bold text-indigo-600">{totalEmails}</div><div className="text-sm text-gray-500">Emails Sent</div></div>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-4">Run History</h2>
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">Loading history…</div>
      ) : runs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">No automation runs yet. Click “Run Now” to trigger a tick, or wait for the cron schedule.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Trigger</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Notifs</th>
                  <th className="px-4 py-3 text-right font-medium">Emails</th>
                  <th className="px-4 py-3 text-right font-medium">Errors</th>
                  <th className="px-4 py-3 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map(r => (
                  <tr key={r.id} onClick={() => setSelectedRun(r)} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(r.started_at)}</td>
                    <td className="px-4 py-3 capitalize">{r.run_type}</td>
                    <td className="px-4 py-3 capitalize">{r.trigger}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full ${statusColor(r.status)}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right">{r.items_processed}</td>
                    <td className="px-4 py-3 text-right">{r.notifications_created}</td>
                    <td className="px-4 py-3 text-right">{r.emails_sent}</td>
                    <td className="px-4 py-3 text-right">{r.errors_count > 0 ? <span className="text-red-600 font-medium">{r.errors_count}</span> : 0}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatDuration(r.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRun(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Run Details</h2>
              <button onClick={() => setSelectedRun(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{selectedRun.run_type}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 text-xs rounded-full ${statusColor(selectedRun.status)}`}>{selectedRun.status}</span></div>
                <div><span className="text-gray-500">Started:</span> {formatDateTime(selectedRun.started_at)}</div>
                <div><span className="text-gray-500">Finished:</span> {formatDateTime(selectedRun.finished_at)}</div>
                <div><span className="text-gray-500">Duration:</span> {formatDuration(selectedRun.duration_ms)}</div>
                <div><span className="text-gray-500">Trigger:</span> <span className="capitalize">{selectedRun.trigger}</span></div>
              </div>
              {selectedRun.error_message && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">Error: {selectedRun.error_message}</div>}
              {selectedRun.details && (
                <div>
                  <h3 className="font-medium mb-2">Details</h3>
                  <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedRun.details, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
