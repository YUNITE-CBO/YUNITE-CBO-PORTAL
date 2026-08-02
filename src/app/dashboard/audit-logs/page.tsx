'use client';

import { useEffect, useState } from 'react';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  record_id: string;
  description: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [page, filterAction]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '25');
      if (filterAction) params.append('action', filterAction);

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setLogs(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        setError(data.error || 'Failed to fetch logs');
      }
    } catch {
      setError('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('create') || action.includes('register')) return 'bg-green-100 text-green-800';
    if (action.includes('update') || action.includes('reverse')) return 'bg-yellow-100 text-yellow-800';
    if (action.includes('delete')) return 'bg-red-100 text-red-800';
    if (action.includes('login')) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getActionLabel = (action: string) => {
    return action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' > ');
  };

  const uniqueActions = Array.from(new Set(logs.map((log) => log.action.split('.')[0])));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-gray-500 mt-1">Complete history of all system actions</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <select
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Actions</option>
              <option value="members">Members</option>
              <option value="transactions">Transactions</option>
              <option value="fines">Fines</option>
              <option value="loans">Loans</option>
              <option value="settings">Settings</option>
              <option value="auth">Authentication</option>
            </select>
          </div>
          <div className="text-sm text-gray-500 flex items-center">
            Page {page} of {totalPages}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl">⏳</span>
            <p className="mt-2">Loading audit logs...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">{error}</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl">📋</span>
            <p className="mt-2">No audit logs found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Record ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDateTime(log.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 font-mono">{log.record_id.substring(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">{log.description || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-indigo-600 hover:text-indigo-900 text-sm"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Log ID</label>
                  <p className="text-sm text-gray-900 font-mono">{selectedLog.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">User ID</label>
                  <p className="text-sm text-gray-900 font-mono">{selectedLog.user_id || 'System'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Action</label>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getActionColor(selectedLog.action)}`}>
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Record ID</label>
                  <p className="text-sm text-gray-900 font-mono">{selectedLog.record_id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">IP Address</label>
                  <p className="text-sm text-gray-900 font-mono">{selectedLog.ip_address || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Timestamp</label>
                  <p className="text-sm text-gray-900">{formatDateTime(selectedLog.created_at)}</p>
                </div>
              </div>

              {selectedLog.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                  <p className="text-sm text-gray-900">{selectedLog.description}</p>
                </div>
              )}

              {selectedLog.before_value && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Before Value</label>
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(selectedLog.before_value, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.after_value && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">After Value</label>
                  <pre className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 overflow-auto">
                    {JSON.stringify(selectedLog.after_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
