'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface HealthResponse {
  success: boolean;
  status: string;
  database?: string;
  timestamp?: string;
  system?: string;
  error?: string;
}

export default function SystemStatusPage() {
  const { isSuperAdmin } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
      setLastChecked(new Date().toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      setHealth({ success: false, status: 'unhealthy', error: 'Cannot reach the application server' });
    } finally { setLoading(false); }
  };

  useEffect(() => { checkHealth(); const i = setInterval(checkHealth, 30000); return () => clearInterval(i); }, []);

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">Super admin access is required to view system status.</p>
        </div>
      </div>
    );
  }

  const isHealthy = health?.status === 'healthy';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
          <p className="text-gray-500 mt-1">Real-time health of the YUNITE platform. Auto-refreshes every 30 seconds.</p>
        </div>
        <button onClick={checkHealth} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {lastChecked && <p className="text-xs text-gray-400 mb-6">Last checked: {lastChecked}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`bg-white rounded-xl shadow-sm border p-6 ${isHealthy ? 'border-green-300' : 'border-red-300'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'} ${loading ? 'animate-pulse' : ''}`} />
            <div>
              <div className="text-lg font-semibold text-gray-900 capitalize">{health?.status || 'checking'}</div>
              <div className="text-sm text-gray-500">Overall Status</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${health?.database === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <div className="text-lg font-semibold text-gray-900 capitalize">{health?.database || 'unknown'}</div>
              <div className="text-sm text-gray-500">Database</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-lg font-semibold text-gray-900">{health?.system || 'YUNITE'}</div>
          <div className="text-sm text-gray-500">Application</div>
        </div>
      </div>

      {health?.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-medium text-red-800 mb-1">Error</h3>
          <p className="text-sm text-red-700 font-mono break-all">{health.error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Diagnostic Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Endpoint</span>
            <span className="font-mono text-gray-900">GET /api/health</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Response Status</span>
            <span className="font-mono text-gray-900">{isHealthy ? '200 OK' : '503 Unavailable'}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Server Timestamp</span>
            <span className="font-mono text-gray-900">{health?.timestamp || '—'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-500">Success Flag</span>
            <span className={`font-mono ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>{String(health?.success)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
