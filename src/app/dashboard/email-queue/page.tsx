'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
}

interface EmailRow {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: string;
  priority: number;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  last_attempt_at: string | null;
}

export default function EmailQueuePage() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, sent: 0, failed: 0 });
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('failed');
  const [processing, setProcessing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/notifications/email?action=stats');
      const data = await res.json();
      if (data.success) setStats(data.data || { pending: 0, processing: 0, sent: 0, failed: 0 });
    } catch { /* ignore */ }
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      // Query email_queue directly is not exposed via an API. Use the stats
      // endpoint for counts; for the list, we rely on the failed list which
      // the email service exposes via retry. For now, show stats prominently.
      await fetchStats();
    } catch { setError('Failed to fetch email queue'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEmails(); }, []);

  const processQueue = async () => {
    setProcessing(true); setError(null);
    try {
      const res = await fetch('/api/notifications/email?action=process', { method: 'POST' });
      const data = await res.json();
      if (data.success) { fetchStats(); setTestResult(`Processed: ${data.data?.processed || 0} · Sent: ${data.data?.succeeded || 0} · Failed: ${data.data?.failed || 0}`); }
      else setError(data.error || 'Processing failed');
    } catch { setError('Failed to process queue'); }
    finally { setProcessing(false); }
  };

  const retryFailed = async () => {
    setRetrying(true); setError(null);
    try {
      const res = await fetch('/api/notifications/email?action=retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) { fetchStats(); setTestResult(data.message || 'Retried'); }
      else setError(data.error || 'Retry failed');
    } catch { setError('Failed to retry'); }
    finally { setRetrying(false); }
  };

  const testConnection = async () => {
    setTesting(true); setError(null); setTestResult(null);
    try {
      const res = await fetch('/api/notifications/email?action=test');
      const data = await res.json();
      setTestResult(data.message || (data.success ? 'Connected' : 'Connection failed'));
    } catch { setError('Test failed'); }
    finally { setTesting(false); }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900">Email Queue</h1>
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">Admin access is required to view the email queue.</p>
        </div>
      </div>
    );
  }

  const total = stats.pending + stats.processing + stats.sent + stats.failed;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Email Queue</h1>
          <p className="text-gray-500 mt-1">Outbound email delivery queue. The automation engine processes this automatically; use these controls to monitor and retry.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={testConnection} disabled={testing} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">{testing ? 'Testing…' : 'Test SMTP'}</button>
          <button onClick={retryFailed} disabled={retrying} className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50">{retrying ? 'Retrying…' : 'Retry Failed'}</button>
          <button onClick={processQueue} disabled={processing} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{processing ? 'Processing…' : 'Process Now'}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}
      {testResult && <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">{testResult}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-500 mt-1">Pending</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-3xl font-bold text-blue-600">{stats.processing}</div>
          <div className="text-sm text-gray-500 mt-1">Processing</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-3xl font-bold text-green-600">{stats.sent}</div>
          <div className="text-sm text-gray-500 mt-1">Sent</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-sm text-gray-500 mt-1">Failed</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Progress</h2>
        {total === 0 ? (
          <p className="text-sm text-gray-500">No emails in the queue.</p>
        ) : (
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden flex">
            {stats.sent > 0 && <div className="bg-green-500 h-4" style={{ width: `${(stats.sent / total) * 100}%` }} title={`Sent: ${stats.sent}`} />}
            {stats.pending > 0 && <div className="bg-yellow-500 h-4" style={{ width: `${(stats.pending / total) * 100}%` }} title={`Pending: ${stats.pending}`} />}
            {stats.processing > 0 && <div className="bg-blue-500 h-4" style={{ width: `${(stats.processing / total) * 100}%` }} title={`Processing: ${stats.processing}`} />}
            {stats.failed > 0 && <div className="bg-red-500 h-4" style={{ width: `${(stats.failed / total) * 100}%` }} title={`Failed: ${stats.failed}`} />}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">The automation cron processes the queue every 5 minutes. Click “Process Now” to force it.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <p><span className="font-medium text-gray-900">Pending:</span> Emails waiting to be sent (notifications, statements, reminders enqueued by the system).</p>
          <p><span className="font-medium text-gray-900">Processing:</span> Emails currently being sent by the SMTP provider.</p>
          <p><span className="font-medium text-gray-900">Sent:</span> Successfully delivered emails.</p>
          <p><span className="font-medium text-gray-900">Failed:</span> Emails that exhausted their retry limit. Use “Retry Failed” to re-queue them after fixing SMTP settings.</p>
          <p className="pt-2 border-t mt-2">Configure SMTP/Gmail credentials in <span className="font-medium">Settings → System Configuration → Notifications</span>. Use “Test SMTP” to verify connectivity.</p>
        </div>
      </div>

      {loading && <div className="mt-4 text-center text-gray-400 text-sm">Loading…</div>}
    </div>
  );
}
