'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { BRAND_COLORS, ORG_IDENTITY } from '@/lib/services/reports/brand';

interface ReportTypeMeta {
  type: string;
  title: string;
  description: string;
  supports_member_scope: boolean;
  formats: string[];
  date_ranges: string[];
}

interface DashboardStats {
  total_members: number;
  active_members: number;
  pending_members: number;
  total_savings: number;
  total_shares: number;
  total_contributions: number;
  total_loans_disbursed: number;
  total_loans_outstanding: number;
  total_fines_pending: number;
}

interface GeneratedDocHistory {
  id: string;
  doc_ref: string;
  auth_hash: string;
  report_type: string;
  title: string;
  format: string;
  period_label: string;
  member_number: string | null;
  generated_by_name: string;
  generated_at: string;
  file_size_bytes: number;
  revoked: boolean;
}

const ICONS: Record<string, string> = {
  financial_summary: '💰',
  member_list: '👥',
  member_profile: '🪪',
  loan_report: '🏦',
  transaction_report: '📋',
  contribution_report: '🎯',
  fine_report: '⚠️',
  member_statement: '📑',
  welfare_report: '🛡️',
  organization_summary: '🏢',
  unity_fund_report: '🏦',
};

const DATE_RANGE_LABELS: Record<string, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  this_year: 'This Year',
  last_year: 'Last Year',
  all_time: 'All Time',
};

export default function ReportsPage() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ReportTypeMeta[]>([]);
  const [history, setHistory] = useState<GeneratedDocHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dateRange, setDateRange] = useState('all_time');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ ref: string; title: string } | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.success) setCatalog(data.data || []);
    } catch {
      /* catalog optional */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/reports/history?limit=20');
      const data = await res.json();
      if (data.success) setHistory(data.data || []);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchReportData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success) setStats(data.data.stats);
    } catch {
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
    loadCatalog();
    loadHistory();
  }, [fetchReportData, loadCatalog, loadHistory]);


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatBytes = (b: number) => {
    if (!b) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  /**
   * Real document generation + download. Hits /api/reports/generate which
   * renders the branded HTML (letterhead + certification stamp) and returns
   * a PDF/CSV. Each generation is recorded in generated_documents for
   * traceability (doc_ref + auth_hash).
   */
  const handleExport = async (reportType: string, format: 'pdf' | 'csv' = 'pdf', memberId?: string) => {
    setExporting(`${reportType}-${format}`);
    setExportError(null);
    setLastExport(null);
    try {
      const url = new URL('/api/reports/generate', window.location.origin);
      url.searchParams.set('type', reportType);
      url.searchParams.set('format', format);
      url.searchParams.set('date_range', dateRange);
      if (memberId) url.searchParams.set('member_id', memberId);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Download failed (${res.status})`);
      }

      const ref = res.headers.get('X-Document-Ref') || '';
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : `${reportType}_${Date.now()}.${format}`;
      const objUrl = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);

      setLastExport({ ref, title: filename });
      loadHistory();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Failed to generate document');
    } finally {
      setExporting(null);
    }
  };


  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canExport = isAdmin || isSuperAdmin || user?.role === 'staff';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports &amp; Documents</h1>
          <p className="text-gray-500 mt-1">Generate, export &amp; verify certified bank-style documents</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Period:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {Object.entries(DATE_RANGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Branded letterhead preview banner */}
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-8" style={{ background: '#fff' }}>
        <div className="flex items-center gap-4 p-5">
          <img src="/branding/logo.svg" alt="Yunite Pamoja CBO" className="h-14 w-auto" />
          <div className="flex-1">
            <div className="text-lg font-bold" style={{ color: BRAND_COLORS.navy }}>{ORG_IDENTITY.name}</div>
            <div className="text-xs text-gray-500">{ORG_IDENTITY.tagline} · {ORG_IDENTITY.address}, {ORG_IDENTITY.city}, {ORG_IDENTITY.country} · {ORG_IDENTITY.email}</div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: BRAND_COLORS.greenSoft, color: BRAND_COLORS.navy }}>
              ✅ Certified Document Engine
            </span>
          </div>
        </div>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${BRAND_COLORS.navy} 0%, ${BRAND_COLORS.navy} 62%, ${BRAND_COLORS.green} 62%, ${BRAND_COLORS.green} 100%)` }} />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}
      {exportError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <strong>Export failed:</strong> {exportError}
        </div>
      )}
      {lastExport && (
        <div className="mb-6 p-4 rounded-lg border" style={{ background: BRAND_COLORS.greenSoft, borderColor: BRAND_COLORS.green + '55', color: BRAND_COLORS.navy }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <strong>Document generated &amp; downloaded.</strong> {lastExport.title}
              <div className="text-xs mt-1">Doc Ref: <code>{lastExport.ref}</code> — every printed copy can be verified at the public verify endpoint.</div>
            </div>
            <a
              href={`/verify/${encodeURIComponent(lastExport.ref)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg font-medium border"
              style={{ borderColor: BRAND_COLORS.navy, color: BRAND_COLORS.navy }}
            >
              Verify authenticity →
            </a>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">👥</div>
            <div>
              <p className="text-sm text-gray-500">Total Members</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_members || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">💰</div>
            <div>
              <p className="text-sm text-gray-500">Total Savings</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_savings || 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">🏦</div>
            <div>
              <p className="text-sm text-gray-500">Loans Outstanding</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_loans_outstanding || 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl">🎯</div>
            <div>
              <p className="text-sm text-gray-500">Contributions</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_contributions || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Document catalog */}
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Documents</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {(catalog.length ? catalog : []).map((card) => (
          <div key={card.type} className="bg-white rounded-xl shadow-sm border p-6 flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: BRAND_COLORS.greenSoft }}>
                {ICONS[card.type] || '📄'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{card.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{card.description}</p>
              </div>
            </div>
            {card.supports_member_scope && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Member-scoped — optionally target a member.
              </p>
            )}
            <div className="mt-4 pt-4 border-t flex gap-2 items-center">
              <button
                onClick={() => handleExport(card.type, 'pdf')}
                disabled={!canExport || exporting === `${card.type}-pdf`}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ background: canExport ? BRAND_COLORS.navy : '#9ca3af' }}
              >
                {exporting === `${card.type}-pdf` ? '⏳ Generating PDF…' : '📄 PDF'}
              </button>
              <button
                onClick={() => handleExport(card.type, 'csv')}
                disabled={!canExport || exporting === `${card.type}-csv`}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50"
                style={{ borderColor: BRAND_COLORS.green, color: BRAND_COLORS.navy }}
              >
                {exporting === `${card.type}-csv` ? '⏳ …' : '📑 CSV'}
              </button>
            </div>
            {!canExport && <p className="mt-2 text-xs text-gray-400">Staff access required to export.</p>}
          </div>
        ))}
      </div>

      {/* Verification / traceability section */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🔐</span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Document Verification &amp; Traceability</h2>
            <p className="text-sm text-gray-500">Every generated document carries a unique reference and authenticity hash. Anyone holding a printed copy can verify it here.</p>
          </div>
        </div>
        <VerifyWidget />
      </div>

      {/* Document history */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generated Document History</h2>
            <p className="text-sm text-gray-500">Immutable audit trail of every exported document.</p>
          </div>
          <button onClick={loadHistory} disabled={historyLoading} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
            {historyLoading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No documents generated yet. Export one above to start the trail.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase border-b">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Document</th>
                  <th className="py-2 px-2">Ref</th>
                  <th className="py-2 px-2">Format</th>
                  <th className="py-2 px-2">Member</th>
                  <th className="py-2 px-2">Generated By</th>
                  <th className="py-2 px-2">Size</th>
                  <th className="py-2 px-2">Verify</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2 text-xs text-gray-600">{new Date(h.generated_at).toLocaleString('en-GB')}</td>
                    <td className="py-2 px-2 font-medium text-gray-900">{h.title}</td>
                    <td className="py-2 px-2"><code className="text-xs">{h.doc_ref}</code></td>
                    <td className="py-2 px-2 uppercase text-xs">{h.format}</td>
                    <td className="py-2 px-2 text-xs">{h.member_number || '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-600">{h.generated_by_name}</td>
                    <td className="py-2 px-2 text-xs text-gray-600">{formatBytes(h.file_size_bytes)}</td>
                    <td className="py-2 px-2">
                      <a href={`/verify/${encodeURIComponent(h.doc_ref)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Verify →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center">{ORG_IDENTITY.copyright}</p>
    </div>
  );
}

/** Inline verification widget — lets a user paste a doc ref and check it. */
function VerifyWidget() {
  const [ref, setRef] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (!ref.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/reports/verify/${encodeURIComponent(ref.trim())}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && verify()}
        placeholder="Paste document reference (e.g. YP-DOC/MEMBER-LIST/…)"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
      <button
        onClick={verify}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
        style={{ background: BRAND_COLORS.navy }}
      >
        {loading ? 'Checking…' : 'Verify'}
      </button>
      {result && (
        <div className="w-full sm:ml-2 mt-2 sm:mt-0">
          {result.verified ? (
            <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: BRAND_COLORS.greenSoft, color: '#15803d' }}>
              ✅ Authentic — {result.document?.title} · issued {new Date(result.document?.issued_at).toLocaleDateString('en-GB')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700">
              ❌ {result.revoked ? 'Document revoked' : 'Not found / invalid'} — {result.error || ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


