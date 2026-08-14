'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, formatRole } from '@/lib/auth';

/**
 * YUNITE AI Intelligence dashboard.
 *
 * Three provider-specific sections (Gemini / OpenRouter / AI Comparison) plus
 * a full-system overview. All AI communication happens through the backend
 * (/api/ai/*) — no provider keys ever reach the browser.
 *
 * Sections are kept independent: an admin can inspect Gemini's report without
 * seeing OpenRouter's conclusions, and vice-versa, preserving the dual-AI
 * independence guarantee even in the UI.
 */

type Tab = 'overview' | 'gemini' | 'openrouter' | 'comparison' | 'history' | 'schedules';

interface HealthData {
  providers: {
    gemini: { live: any; latest_snapshot: any };
    openrouter: { live: any; latest_snapshot: any };
  };
  overall_intelligence_score: number;
  recent_totals: { critical: number; high: number; medium: number; low: number; unresolved: number };
  recent_provider_runs: any[];
  configured: { primary: string; gemini_model: string; openrouter_model: string; dual_mode: boolean };
}

interface Investigation {
  id: string;
  investigation_number: string;
  scope: string;
  status: string;
  ai_status: string;
  overall_score: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  unresolved_count: number;
  started_at: string;
  completed_at: string | null;
}

interface InvestigationDetail {
  investigation: Investigation;
  reports: any[];
  provider_runs: any[];
  comparison: any;
  verification: any;
}

interface Schedule {
  id: string;
  name: string;
  scope: string;
  cadence: string;
  is_enabled: boolean;
  time_of_day: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

const SCOPE_LABELS: Record<string, string> = {
  database: 'Database Consistency',
  cross_module: 'Cross-Module',
  business_rules: 'Business Rules',
  api: 'API Consistency',
  financial: 'Financial Reconciliation',
  member_verification: 'Member Verification',
  full_system: 'Full System Investigation',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  healthy: { label: 'HEALTHY', color: '#16a34a' },
  degraded: { label: 'DEGRADED', color: '#ca8a04' },
  down: { label: 'DOWN', color: '#dc2626' },
  unknown: { label: 'UNKNOWN', color: '#6b7280' },
};

export default function AiIntelligencePage() {
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [running, setRunning] = useState(false);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/health', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setHealth(json.data);
    } catch (e: any) {
      setError(`Health load failed: ${e?.message || e}`);
    }
  }, []);

  const loadInvestigations = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/investigations?limit=30', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setInvestigations(json.data || []);
    } catch (e: any) {
      setError(`Investigations load failed: ${e?.message || e}`);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/schedules', { credentials: 'include' });
      const json = await res.json();
      if (json.success) setSchedules(json.data || []);
    } catch (e: any) {
      setError(`Schedules load failed: ${e?.message || e}`);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAdmin) {
      loadHealth();
      loadInvestigations();
      loadSchedules();
    }
  }, [isLoading, isAdmin, loadHealth, loadInvestigations, loadSchedules]);

  const runInvestigation = useCallback(async (scope: string, memberId?: string) => {
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/ai/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope, memberId }),
      });
      const json = await res.json();
      if (json.success) {
        setInfo(`Investigation ${json.data.investigation_number} completed — score ${json.data.overall_score}.`);
        await loadHealth();
        await loadInvestigations();
      } else {
        setError(json.error || 'Investigation failed');
      }
    } catch (e: any) {
      setError(`Investigation failed: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  }, [loadHealth, loadInvestigations]);

  const verifyMember = useCallback(async () => {
    if (!memberIdInput.trim()) {
      setError('Enter a member ID first.');
      return;
    }
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/ai/member-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId: memberIdInput.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setInfo(`Member verification complete — score ${json.data.overall_score}.`);
        await loadHealth();
        await loadInvestigations();
        setTab('comparison');
      } else {
        setError(json.error || 'Verification failed');
      }
    } catch (e: any) {
      setError(`Verification failed: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  }, [memberIdInput, loadHealth, loadInvestigations]);

  const openInvestigation = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/ai/investigations/${id}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setDetail(json.data);
      else setError(json.error || 'Failed to load investigation');
    } catch (e: any) {
      setError(`Load failed: ${e?.message || e}`);
    }
  }, []);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Sign in to access the AI Intelligence console.</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-slate-600">
        <h1 className="text-xl font-semibold">AI Intelligence</h1>
        <p className="mt-2 text-sm">This section requires an admin or super_admin role. Your role: <span className="font-mono">{formatRole(user.role)}</span></p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '🧠' },
    { id: 'gemini', label: 'Gemini', icon: '✨' },
    { id: 'openrouter', label: 'OpenRouter', icon: '🔀' },
    { id: 'comparison', label: 'AI Comparison', icon: '⚖️' },
    { id: 'history', label: 'Report History', icon: '📚' },
    { id: 'schedules', label: 'Schedules', icon: '🗓️' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">YUNITE AI Intelligence</h1>
            <p className="mt-1 text-sm text-slate-500">
              Dual-AI investigation &amp; consistency engine. Database + deterministic engines remain the source of truth.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: scoreColor(health?.overall_intelligence_score ?? 100) }}>
              System Health: {health?.overall_intelligence_score ?? '—'}%
            </span>
          </div>
        </div>

        {!isSuperAdmin && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            You are signed in as <strong>{formatRole(user.role)}</strong>. Investigations are available; schedule editing is super_admin only.
          </div>
        )}

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {info && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{info}</div>}

        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Run Full Investigation" running={running} onClick={() => runInvestigation('full_system')} primary />
            <ActionButton label="Database Investigation" running={running} onClick={() => runInvestigation('database')} />
            <ActionButton label="API Investigation" running={running} onClick={() => runInvestigation('api')} />
            <ActionButton label="Financial Investigation" running={running} onClick={() => runInvestigation('financial')} />
            <ActionButton label="Cross-Module" running={running} onClick={() => runInvestigation('cross_module')} />
            <ActionButton label="Business Rules" running={running} onClick={() => runInvestigation('business_rules')} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-slate-600">Verify Member Account</label>
              <input
                value={memberIdInput}
                onChange={(e) => setMemberIdInput(e.target.value)}
                placeholder="Member UUID"
                className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <ActionButton label="Verify Member" running={running} onClick={verifyMember} />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDetail(null); }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewSection health={health} investigations={investigations} onRun={runInvestigation} running={running} />}
        {tab === 'gemini' && <ProviderSection provider="gemini" health={health} investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'openrouter' && <ProviderSection provider="openrouter" health={health} investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'comparison' && <ComparisonSection investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'history' && <HistorySection investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'schedules' && (
          <SchedulesSection schedules={schedules} canEdit={isSuperAdmin} onReload={loadSchedules} />
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, running, primary }: { label: string; onClick: () => void; running: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        primary ? 'bg-slate-900 text-white hover:bg-slate-700' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {running ? 'Running…' : label}
    </button>
  );
}

function OverviewSection({ health, investigations, onRun, running }: { health: HealthData | null; investigations: Investigation[]; onRun: (s: string) => void; running: boolean }) {
  const totals = health?.recent_totals ?? { critical: 0, high: 0, medium: 0, low: 0, unresolved: 0 };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Gemini" value={statusBadge(health?.providers.gemini.live.status)} color={STATUS_BADGE[health?.providers.gemini.live.status]?.color || '#6b7280'} />
        <StatCard label="OpenRouter" value={statusBadge(health?.providers.openrouter.live.status)} color={STATUS_BADGE[health?.providers.openrouter.live.status]?.color || '#6b7280'} />
        <StatCard label="Configured Primary" value={health?.configured.primary ?? 'gemini'} />
        <StatCard label="Dual Mode" value={health?.configured.dual_mode ? 'ENABLED' : 'OFF'} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <FindingCard label="Critical" value={totals.critical} color={SEVERITY_COLORS.critical} />
        <FindingCard label="High" value={totals.high} color={SEVERITY_COLORS.high} />
        <FindingCard label="Medium" value={totals.medium} color={SEVERITY_COLORS.medium} />
        <FindingCard label="Low" value={totals.low} color={SEVERITY_COLORS.low} />
        <FindingCard label="Unresolved" value={totals.unresolved} color={SEVERITY_COLORS.info} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recent Investigations</h3>
          <ActionButton label="Run Full Investigation" running={running} onClick={() => onRun('full_system')} primary />
        </div>
        <InvestigationsTable investigations={investigations.slice(0, 10)} />
      </div>

      {health && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
          <strong className="text-slate-700">Provider configuration:</strong>{' '}
          Gemini model = <code className="rounded bg-slate-100 px-1">{health.configured.gemini_model}</code>,{' '}
          OpenRouter model = <code className="rounded bg-slate-100 px-1">{health.configured.openrouter_model}</code>.{' '}
          API keys are server-side only and never exposed to the browser.
        </div>
      )}
    </div>
  );
}

function ProviderSection({ provider, health, investigations, onOpen, detail }: {
  provider: 'gemini' | 'openrouter';
  health: HealthData | null;
  investigations: Investigation[];
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
}) {
  const live = provider === 'gemini' ? health?.providers.gemini.live : health?.providers.openrouter.live;
  const snapshot = provider === 'gemini' ? health?.providers.gemini.latest_snapshot : health?.providers.openrouter.latest_snapshot;
  const label = provider === 'gemini' ? 'Gemini' : 'OpenRouter';
  const providerReports = detail?.reports?.filter((r: any) => r.provider === provider) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">{label} Status</h3>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: STATUS_BADGE[live?.status]?.color || '#6b7280' }}>
            {statusBadge(live?.status)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Metric label="Availability" value={`${live?.availability_pct ?? 0}%`} />
          <Metric label="Successes" value={live?.success_count ?? 0} />
          <Metric label="Failures" value={live?.failure_count ?? 0} />
          <Metric label="Timeouts" value={live?.timeout_count ?? 0} />
          <Metric label="Rate-limited" value={live?.rate_limited_count ?? 0} />
          <Metric label="Fallback events" value={live?.fallback_count ?? 0} />
          {snapshot && <Metric label="Avg latency" value={`${snapshot.avg_latency_ms ?? 0}ms`} />}
          {snapshot && <Metric label="Last snapshot" value={fmt(snapshot.snapshot_at)} />}
        </div>
      </div>

      {detail && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{label} Report (Investigation {detail.investigation.investigation_number})</h3>
          {providerReports.length === 0 ? (
            <p className="text-xs text-slate-500">No {label} report for this investigation (provider may have been unavailable).</p>
          ) : (
            <ReportView report={providerReports[0]} />
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{label} Investigations</h3>
        <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
      </div>
    </div>
  );
}

function ComparisonSection({ investigations, onOpen, detail }: { investigations: Investigation[]; onOpen: (id: string) => void; detail: InvestigationDetail | null }) {
  const cmp = detail?.comparison;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">
          Select a dual-mode investigation (full_system or member_verification runs both providers) to compare Gemini and OpenRouter conclusions. Disputed findings are never auto-promoted to facts.
        </p>
        <div className="mt-3">
          <InvestigationsTable
            investigations={investigations.filter((i) => i.scope === 'full_system' || i.scope === 'member_verification')}
            onOpen={onOpen}
            selectedId={detail?.investigation.id}
          />
        </div>
      </div>

      {detail && !cmp && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No comparison available for this investigation. Comparisons are produced when both Gemini and OpenRouter ran independently.
        </div>
      )}

      {cmp && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <FindingCard label="Agreements" value={cmp.counts?.agreements ?? 0} color="#16a34a" />
            <FindingCard label="Gemini only" value={cmp.counts?.gemini_only ?? 0} color="#7c3aed" />
            <FindingCard label="OpenRouter only" value={cmp.counts?.openrouter_only ?? 0} color="#0891b2" />
            <FindingCard label="Disagreements" value={cmp.counts?.disagreements ?? 0} color="#dc2626" />
            <FindingCard label="Verified" value={cmp.counts?.verified ?? 0} color="#16a34a" />
            <FindingCard label="Human Review" value={cmp.counts?.human_review ?? 0} color="#ea580c" />
          </div>

          {cmp.agreements?.length > 0 && (
            <ComparisonGroup title="✅ Agreements (found by both)" findings={cmp.agreements} tint="#f0fdf4" />
          )}
          {cmp.gemini_only?.length > 0 && (
            <ComparisonGroup title="✨ Gemini only" findings={cmp.gemini_only} tint="#faf5ff" />
          )}
          {cmp.openrouter_only?.length > 0 && (
            <ComparisonGroup title="🔀 OpenRouter only" findings={cmp.openrouter_only} tint="#ecfeff" />
          )}
          {cmp.disagreements?.length > 0 && (
            <ComparisonGroup title="⚠️ Disagreements (REQUIRES VERIFICATION)" findings={cmp.disagreements.map((d: any) => d.gemini || d.openrouter)} tint="#fef2f2" warn />
          )}
          {cmp.human_review?.length > 0 && (
            <ComparisonGroup title="🔍 Human Review required" findings={cmp.human_review} tint="#fff7ed" />
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonGroup({ title, findings, tint, warn }: { title: string; findings: any[]; tint: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4" style={{ background: tint }}>
      <h4 className={`mb-2 text-sm font-semibold ${warn ? 'text-red-800' : 'text-slate-800'}`}>{title}</h4>
      <ul className="space-y-1.5">
        {findings.map((f: any, i: number) => (
          <li key={i} className="rounded-md bg-white/70 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{f.title}</span>
              <span style={{ color: SEVERITY_COLORS[f.severity] ?? '#6b7280' }} className="font-semibold uppercase">{f.severity}</span>
            </div>
            <div className="mt-1 text-slate-500">{f.module} · {f.category}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistorySection({ investigations, onOpen, detail }: { investigations: Investigation[]; onOpen: (id: string) => void; detail: InvestigationDetail | null }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Investigation History</h3>
        <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
      </div>
      {detail && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Investigation {detail.investigation.investigation_number} — detail</h3>
          {detail.verification && <VerificationResultView result={detail.verification} />}
          {detail.provider_runs?.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-slate-600">Provider runs</h4>
              <ul className="space-y-1 text-xs text-slate-600">
                {detail.provider_runs.map((r: any) => (
                  <li key={r.id}>{r.provider} · {r.role} · {r.status} · {r.latency_ms}ms{r.is_fallback ? ' (fallback)' : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SchedulesSection({ schedules, canEdit, onReload }: { schedules: Schedule[]; canEdit: boolean; onReload: () => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('database');
  const [cadence, setCadence] = useState('daily');
  const [time, setTime] = useState('03:00');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = useCallback(async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/ai/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, scope, cadence, is_enabled: true, time_of_day: time, day_of_week: cadence === 'weekly' ? 1 : null, day_of_month: cadence === 'monthly' ? 1 : null }),
      });
      const json = await res.json();
      if (json.success) { setName(''); await onReload(); }
      else setErr(json.error || 'Failed');
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setSaving(false); }
  }, [name, scope, cadence, time, onReload]);

  const toggle = useCallback(async (s: Schedule) => {
    try {
      await fetch(`/api/ai/schedules/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...s, is_enabled: !s.is_enabled }),
      });
      await onReload();
    } catch { /* best-effort */ }
  }, [onReload]);

  const remove = useCallback(async (id: string) => {
    try {
      await fetch(`/api/ai/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
      await onReload();
    } catch { /* best-effort */ }
  }, [onReload]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Scheduled Investigations</h3>
        <p className="mb-3 text-xs text-slate-500">
          The cron endpoint <code className="rounded bg-slate-100 px-1">/api/cron/ai-investigations</code> runs due schedules every few minutes. On-demand scopes are listed but not cron-driven.
        </p>
        {schedules.length === 0 ? (
          <p className="text-xs text-slate-400">No schedules configured.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Name</th><th>Scope</th><th>Cadence</th><th>Time</th><th>Next run</th><th>Enabled</th><th></th></tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium text-slate-700">{s.name}</td>
                  <td>{SCOPE_LABELS[s.scope] ?? s.scope}</td>
                  <td>{s.cadence}</td>
                  <td>{s.time_of_day || '—'}</td>
                  <td>{fmt(s.next_run_at)}</td>
                  <td><span className={s.is_enabled ? 'text-green-600' : 'text-slate-400'}>{s.is_enabled ? 'ON' : 'OFF'}</span></td>
                  <td className="text-right">
                    {canEdit && (
                      <span className="inline-flex gap-2">
                        <button className="text-slate-500 hover:underline" onClick={() => toggle(s)}>{s.is_enabled ? 'Disable' : 'Enable'}</button>
                        <button className="text-red-500 hover:underline" onClick={() => remove(s.id)}>Delete</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Create schedule (super_admin)</h3>
          {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="inp" placeholder="Weekly full scan" /></Field>
            <Field label="Scope">
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="inp">
                {Object.entries(SCOPE_LABELS).filter(([k]) => k !== 'member_verification').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Cadence">
              <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="inp">
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="on_demand">On demand</option>
              </select>
            </Field>
            <Field label="Time (HH:MM)"><input value={time} onChange={(e) => setTime(e.target.value)} className="inp w-24" /></Field>
            <ActionButton label={saving ? 'Saving…' : 'Create'} onClick={create} running={saving} primary />
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Schedule creation/editing is super_admin only.
        </div>
      )}
    </div>
  );
}

function InvestigationsTable({ investigations, onOpen, selectedId }: { investigations: Investigation[]; onOpen?: (id: string) => void; selectedId?: string }) {
  if (!investigations.length) return <p className="text-xs text-slate-400">No investigations yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1">ID</th><th>Scope</th><th>Status</th><th>AI</th><th>Score</th><th>Crit</th><th>High</th><th>Unres.</th><th>When</th>
          </tr>
        </thead>
        <tbody>
          {investigations.map((inv) => (
            <tr
              key={inv.id}
              className={`border-t border-slate-100 ${onOpen ? 'cursor-pointer hover:bg-slate-50' : ''} ${selectedId === inv.id ? 'bg-slate-100' : ''}`}
              onClick={() => onOpen?.(inv.id)}
            >
              <td className="py-1.5 font-mono text-slate-600">{inv.investigation_number}</td>
              <td>{SCOPE_LABELS[inv.scope] ?? inv.scope}</td>
              <td>{inv.status}</td>
              <td>{inv.ai_status}</td>
              <td><span style={{ color: scoreColor(inv.overall_score) }} className="font-semibold">{inv.overall_score}%</span></td>
              <td className="font-semibold text-red-600">{inv.critical_count}</td>
              <td className="font-semibold text-orange-600">{inv.high_count}</td>
              <td>{inv.unresolved_count}</td>
              <td className="text-slate-400">{fmt(inv.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ report }: { report: any }) {
  const findings = report.findings ?? [];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600"><strong className="text-slate-700">Summary:</strong> {report.summary}</div>
      {report.root_cause_analysis && <div className="text-xs text-slate-600"><strong className="text-slate-700">Root-cause:</strong> {report.root_cause_analysis}</div>}
      {report.recommendations?.length > 0 && (
        <div className="text-xs text-slate-600">
          <strong className="text-slate-700">Recommendations:</strong>
          <ul className="ml-4 list-disc">{report.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      <div>
        <strong className="text-xs text-slate-700">Findings ({findings.length}):</strong>
        <ul className="mt-1 space-y-1.5">
          {findings.map((f: any, i: number) => (
            <li key={i} className="rounded-md border border-slate-100 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{f.title}</span>
                <span style={{ color: SEVERITY_COLORS[f.severity] ?? '#6b7280' }} className="font-semibold uppercase">{f.severity}</span>
              </div>
              <div className="mt-0.5 text-slate-500">{f.module} · {f.category} · confidence {f.confidence} · {f.verification_status}</div>
              {f.evidence?.length > 0 && (
                <ul className="mt-1 ml-4 list-disc text-slate-400">
                  {f.evidence.map((e: any, j: number) => (
                    <li key={j}>{e.source_label}{e.field ? `: ${e.field}` : ''}{e.actual_value != null ? ` = ${e.actual_value}` : ''}{e.difference ? ` (Δ ${e.difference})` : ''}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function VerificationResultView({ result }: { result: any }) {
  const fields = result.field_results ?? [];
  return (
    <div>
      <div className="mb-2 text-xs text-slate-600">
        <strong className="text-slate-700">Member Verification:</strong> {result.member_number} · score {result.verification_score}% · {result.overall_status} · {result.fields_verified}/{result.fields_checked} fields verified
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500"><tr><th className="py-1">Field</th><th>Database</th><th>API</th><th>Display</th><th>Match</th><th>Severity</th></tr></thead>
        <tbody>
          {fields.map((f: any, i: number) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-1 font-medium text-slate-700">{f.field}</td>
              <td className="font-mono">{f.database ?? '—'}</td>
              <td className="font-mono">{f.api ?? '—'}</td>
              <td className="font-mono">{f.display ?? '—'}</td>
              <td>{f.match ? '✅' : '❌'}</td>
              <td style={{ color: SEVERITY_COLORS[f.severity] ?? '#6b7280' }} className="uppercase">{f.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color: color || '#0f172a' }}>{value}</div>
    </div>
  );
}
function FindingCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-xs uppercase text-slate-500">{label}</div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="font-semibold text-slate-700">{value ?? '—'}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col"><span className="mb-1 text-xs font-medium text-slate-600">{label}</span>{children}</label>;
}

function scoreColor(s: number): string {
  if (s >= 90) return '#16a34a';
  if (s >= 70) return '#ca8a04';
  return '#dc2626';
}
function statusBadge(s?: string): string {
  return STATUS_BADGE[s ?? 'unknown']?.label ?? 'UNKNOWN';
}
function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch { return d; }
}
