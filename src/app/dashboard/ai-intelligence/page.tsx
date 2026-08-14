'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, formatRole } from '@/lib/auth';

/**
 * YUNITE AI Intelligence — Deep Forensic dashboard.
 *
 * Redesigned (req. #26, #27): 14 tabs — Overview, Critical Findings, Modules,
 * Database, Backend, APIs, Business Rules, Member Lookup, Gemini, OpenRouter,
 * Comparison, Evidence, Recommendations, History — plus Schedules.
 *
 * Features:
 *  - Module health map (clickable, drill-down per module) (req. #20, #21)
 *  - Member search by name/number/id/phone/email with candidate selection (req. #11, #18)
 *  - Deep finding cards with full location (DB table/field, backend route/service,
 *    frontend component, expected/actual/difference, affected records, root cause)
 *  - Dual AI mode toggle (ON/OFF) (req. #8)
 *  - Investigation depth selector (Quick/Standard/Deep/Forensic) (req. #25)
 *  - Investigation history table (fixed — no more "No investigations yet" bug) (req. #28)
 *  - Dual-mode history with Gemini/OpenRouter/Combined counts (req. #29)
 *  - PARTIAL DUAL INVESTIGATION display when one provider fails (req. #30)
 *
 * All AI communication happens through the backend (/api/ai/*) — no provider
 * keys ever reach the browser.
 */

type Tab = 'overview' | 'critical' | 'modules' | 'database' | 'backend' | 'apis' | 'business_rules'
  | 'member_lookup' | 'gemini' | 'openrouter' | 'comparison' | 'evidence' | 'recommendations' | 'history' | 'schedules';

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
  info_count?: number;
  unresolved_count: number;
  records_checked?: number;
  duration_ms?: number | null;
  started_at: string;
  finished_at?: string | null;
  depth?: string;
  dual_mode?: string;
}

interface InvestigationDetail {
  investigation: Investigation;
  reports: any[];
  provider_runs: any[];
  comparison: any;
  verification: any;
  findings: any[];
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

interface ModuleHealthEntry {
  module: string;
  status: 'healthy' | 'warning' | 'inconsistent';
  findings_count: number;
  critical_count: number;
  high_count: number;
  affected_members?: number;
  affected_records?: number;
  total_difference?: string;
  finding_codes?: string[];
}

interface MemberCandidate {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  id_number?: string;
  status: string;
  matched_by: string[];
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

const MODULE_STATUS_ICON: Record<string, string> = {
  healthy: '✓',
  warning: '⚠',
  inconsistent: '✕',
};

export default function AiIntelligencePage() {
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealthEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberCandidates, setMemberCandidates] = useState<MemberCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep' | 'forensic'>('deep');
  const [dualMode, setDualMode] = useState<'auto' | 'single' | 'dual'>('auto');
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
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

  const loadModuleHealth = useCallback(async (investigationId?: string) => {
    try {
      const url = investigationId
        ? `/api/ai/module-health?investigationId=${investigationId}`
        : '/api/ai/module-health';
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setModuleHealth(json.data.modules || []);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAdmin) {
      loadHealth();
      loadInvestigations();
      loadSchedules();
      loadModuleHealth();
    }
  }, [isLoading, isAdmin, loadHealth, loadInvestigations, loadSchedules, loadModuleHealth]);

  const runInvestigation = useCallback(async (scope: string, memberId?: string) => {
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/ai/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope, memberId, depth, dualMode }),
      });
      const json = await res.json();
      if (json.success) {
        const counts = json.data.final_report?.counts;
        setInfo(
          `Investigation ${json.data.investigation_number} (${depth}/${dualMode}) — score ${json.data.overall_score}. ` +
          `${counts?.critical ?? 0} critical, ${counts?.high ?? 0} high, ${counts?.medium ?? 0} medium, ${counts?.low ?? 0} low. ` +
          `AI: ${json.data.ai_status}.`
        );
        await loadHealth();
        await loadInvestigations();
        await loadModuleHealth();
      } else {
        setError(json.error || 'Investigation failed');
      }
    } catch (e: any) {
      setError(`Investigation failed: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  }, [depth, dualMode, loadHealth, loadInvestigations, loadModuleHealth]);

  const searchMembers = useCallback(async () => {
    if (!memberSearchQuery.trim()) {
      setError('Enter a name, member number, ID, phone, or email.');
      return;
    }
    setSearching(true);
    setError(null);
    setMemberCandidates([]);
    try {
      const res = await fetch('/api/ai/member-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: memberSearchQuery.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setMemberCandidates(json.data || []);
        if (!json.data?.length) setInfo('No members matched your search.');
      } else {
        setError(json.error || 'Search failed');
      }
    } catch (e: any) {
      setError(`Search failed: ${e?.message || e}`);
    } finally {
      setSearching(false);
    }
  }, [memberSearchQuery]);

  const verifyMember = useCallback(async (memberId: string) => {
    setRunning(true);
    setError(null);
    setInfo(null);
    setMemberCandidates([]);
    try {
      const res = await fetch('/api/ai/member-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberId, depth, dualMode }),
      });
      const json = await res.json();
      if (json.success) {
        const counts = json.data.final_report?.counts;
        setInfo(
          `Member verification complete — score ${json.data.overall_score}. ` +
          `${counts?.critical ?? 0} critical, ${counts?.high ?? 0} high findings. AI: ${json.data.ai_status}.`
        );
        await loadHealth();
        await loadInvestigations();
        await loadModuleHealth();
        setTab('member_lookup');
      } else {
        setError(json.error || 'Verification failed');
      }
    } catch (e: any) {
      setError(`Verification failed: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  }, [depth, dualMode, loadHealth, loadInvestigations, loadModuleHealth]);

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
    { id: 'critical', label: 'Critical Findings', icon: '🚨' },
    { id: 'modules', label: 'Modules', icon: '🗺️' },
    { id: 'database', label: 'Database', icon: '🗄️' },
    { id: 'backend', label: 'Backend', icon: '⚙️' },
    { id: 'apis', label: 'APIs', icon: '🔗' },
    { id: 'business_rules', label: 'Business Rules', icon: '📋' },
    { id: 'member_lookup', label: 'Member Lookup', icon: '👤' },
    { id: 'gemini', label: 'Gemini', icon: '✨' },
    { id: 'openrouter', label: 'OpenRouter', icon: '🔀' },
    { id: 'comparison', label: 'Comparison', icon: '⚖️' },
    { id: 'evidence', label: 'Evidence', icon: '🔬' },
    { id: 'recommendations', label: 'Recommendations', icon: '💡' },
    { id: 'history', label: 'History', icon: '📚' },
    { id: 'schedules', label: 'Schedules', icon: '🗓️' },
  ];

  const allFindings = detail?.findings ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">YUNITE AI Forensic Intelligence</h1>
            <p className="mt-1 text-sm text-slate-500">
              Deep forensic investigation &amp; consistency engine. Database + deterministic engines remain the source of truth.
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

        {/* Actions bar with depth + dual mode selectors (req. #8, #25) */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Depth:
              <select value={depth} onChange={(e) => setDepth(e.target.value as any)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                <option value="quick">Quick</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
                <option value="forensic">Forensic</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              AI Mode:
              <select value={dualMode} onChange={(e) => setDualMode(e.target.value as any)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                <option value="auto">Auto (env)</option>
                <option value="single">Single AI</option>
                <option value="dual">Dual AI</option>
              </select>
            </label>
          </div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Run Full Investigation" running={running} onClick={() => runInvestigation('full_system')} primary />
            <ActionButton label="Database Investigation" running={running} onClick={() => runInvestigation('database')} />
            <ActionButton label="API Investigation" running={running} onClick={() => runInvestigation('api')} />
            <ActionButton label="Financial Investigation" running={running} onClick={() => runInvestigation('financial')} />
            <ActionButton label="Cross-Module" running={running} onClick={() => runInvestigation('cross_module')} />
            <ActionButton label="Business Rules" running={running} onClick={() => runInvestigation('business_rules')} />
          </div>
          {/* Member search (req. #11, #18) */}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-600">Verify Member Account — search by name, number, ID, phone, or email</h3>
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchMembers(); }}
                placeholder="John Mwangi / MBR-00123 / 0712345678 / 12345678 / john@example.com"
                className="w-96 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <ActionButton label={searching ? 'Searching…' : 'Search'} onClick={searchMembers} running={searching} />
            </div>
            {memberCandidates.length > 0 && (
              <div className="mt-2 rounded-md border border-slate-200">
                <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {memberCandidates.length} member(s) found — select one to verify
                </div>
                <ul className="divide-y divide-slate-100">
                  {memberCandidates.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium text-slate-800">{c.first_name} {c.last_name}</span>
                        <span className="ml-2 text-slate-500">#{c.member_number}</span>
                        {c.phone && <span className="ml-2 text-slate-400">{c.phone.slice(0, 4)}****</span>}
                        <span className="ml-2 text-slate-400">{c.status}</span>
                        <span className="ml-2 text-slate-300">matched: {c.matched_by.join(', ')}</span>
                      </div>
                      <button
                        onClick={() => verifyMember(c.id)}
                        disabled={running}
                        className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        Verify This Member
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedModule(null); }}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewSection health={health} investigations={investigations} moduleHealth={moduleHealth} onRun={runInvestigation} running={running} onOpen={openInvestigation} detail={detail} />}
        {tab === 'critical' && <FindingsTab findings={allFindings.filter((f) => f.severity === 'critical')} title="Critical Findings" onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'modules' && <ModulesTab moduleHealth={moduleHealth} findings={allFindings} selectedModule={selectedModule} onSelect={setSelectedModule} onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'database' && <FindingsTab findings={allFindings.filter((f) => f.module === 'savings' || f.module === 'transactions' || f.module === 'accounts' || f.module === 'members' || f.category?.includes('db'))} title="Database Findings" onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'backend' && <FindingsTab findings={allFindings.filter((f) => f.location?.backend?.route || f.category?.includes('api') || f.category?.includes('backend'))} title="Backend Findings" onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'apis' && <FindingsTab findings={allFindings.filter((f) => f.module === 'api' || f.location?.backend?.route)} title="API Findings" onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'business_rules' && <FindingsTab findings={allFindings.filter((f) => f.module === 'loans' || f.module === 'shares' || f.category?.includes('business_rule') || f.category?.includes('configuration'))} title="Business Rule Findings" onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'member_lookup' && <MemberLookupTab onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'gemini' && <ProviderSection provider="gemini" health={health} investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'openrouter' && <ProviderSection provider="openrouter" health={health} investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'comparison' && <ComparisonSection investigations={investigations} onOpen={openInvestigation} detail={detail} />}
        {tab === 'evidence' && <EvidenceTab findings={allFindings} onOpen={openInvestigation} detail={detail} investigations={investigations} />}
        {tab === 'recommendations' && <RecommendationsTab findings={allFindings} onOpen={openInvestigation} detail={detail} investigations={investigations} />}
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

function OverviewSection({ health, investigations, moduleHealth, onRun, running, onOpen, detail }: {
  health: HealthData | null;
  investigations: Investigation[];
  moduleHealth: ModuleHealthEntry[];
  onRun: (s: string) => void;
  running: boolean;
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
}) {
  const totals = health?.recent_totals ?? { critical: 0, high: 0, medium: 0, low: 0, unresolved: 0 };
  const inconsistentModules = moduleHealth.filter((m) => m.status === 'inconsistent');
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

      {/* Module health map summary (req. #20) */}
      {moduleHealth.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Module Health Map</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {moduleHealth.slice(0, 18).map((m) => (
              <div key={m.module} className={`rounded-md border px-3 py-2 text-xs ${
                m.status === 'healthy' ? 'border-green-200 bg-green-50' :
                m.status === 'warning' ? 'border-amber-200 bg-amber-50' :
                'border-red-200 bg-red-50'
              }`}>
                <div className="font-medium text-slate-700">{m.module}</div>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className={m.status === 'healthy' ? 'text-green-600' : m.status === 'warning' ? 'text-amber-600' : 'text-red-600'}>
                    {MODULE_STATUS_ICON[m.status]} {m.status.toUpperCase()}
                  </span>
                </div>
                {m.findings_count > 0 && <div className="mt-0.5 text-slate-400">{m.findings_count} finding(s)</div>}
              </div>
            ))}
          </div>
          {inconsistentModules.length > 0 && (
            <div className="mt-3 text-xs text-red-700">
              ⚠ {inconsistentModules.length} module(s) inconsistent: {inconsistentModules.map((m) => m.module).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recent Investigations</h3>
          <ActionButton label="Run Full Investigation" running={running} onClick={() => onRun('full_system')} primary />
        </div>
        <InvestigationsTable investigations={investigations.slice(0, 10)} onOpen={onOpen} selectedId={detail?.investigation.id} />
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

function ModulesTab({ moduleHealth, findings, selectedModule, onSelect, onOpen, detail, investigations }: {
  moduleHealth: ModuleHealthEntry[];
  findings: any[];
  selectedModule: string | null;
  onSelect: (m: string | null) => void;
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
  investigations: Investigation[];
}) {
  const moduleFindings = selectedModule ? findings.filter((f) => f.module === selectedModule || f.location?.module === selectedModule) : [];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Module Health Map — click a module for drill-down (req. #20, #21)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {moduleHealth.map((m) => (
            <button
              key={m.module}
              onClick={() => onSelect(selectedModule === m.module ? null : m.module)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-shadow hover:shadow-md ${
                selectedModule === m.module ? 'ring-2 ring-slate-400' : ''
              } ${
                m.status === 'healthy' ? 'border-green-200 bg-green-50' :
                m.status === 'warning' ? 'border-amber-200 bg-amber-50' :
                'border-red-200 bg-red-50'
              }`}
            >
              <div className="font-medium text-slate-700">{m.module}</div>
              <div className="mt-0.5">
                <span className={m.status === 'healthy' ? 'text-green-600' : m.status === 'warning' ? 'text-amber-600' : 'text-red-600'}>
                  {MODULE_STATUS_ICON[m.status]} {m.status.toUpperCase()}
                </span>
              </div>
              {m.findings_count > 0 && <div className="mt-0.5 text-slate-400">{m.findings_count} finding(s), {m.critical_count} crit</div>}
              {m.affected_members != null && <div className="text-slate-400">{m.affected_members} member(s)</div>}
              {m.total_difference && <div className="text-slate-400">Δ {m.total_difference}</div>}
            </button>
          ))}
        </div>
      </div>

      {selectedModule && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 capitalize">{selectedModule} Module — drill-down (req. #21)</h3>
          {moduleFindings.length === 0 ? (
            <p className="text-xs text-slate-400">No findings for this module in the selected investigation.</p>
          ) : (
            <div className="space-y-2">
              {moduleFindings.map((f, i) => <DeepFindingCard key={i} finding={f} />)}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Investigations</h3>
        <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
      </div>
    </div>
  );
}

function FindingsTab({ findings, title, onOpen, detail, investigations }: {
  findings: any[];
  title: string;
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
  investigations: Investigation[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{title} ({findings.length})</h3>
        {findings.length === 0 ? (
          <p className="text-xs text-slate-400">No findings in this category. Run an investigation and select it from history to see findings here.</p>
        ) : (
          <div className="space-y-2">
            {findings.map((f, i) => <DeepFindingCard key={i} finding={f} />)}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Select an investigation to view its findings</h3>
        <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
      </div>
    </div>
  );
}

/** Deep finding card with full location (req. #1, #2, #3, #32). */
function DeepFindingCard({ finding }: { finding: any }) {
  const loc = finding.location;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-800">
          <span className="font-mono text-slate-500">{finding.finding_code}</span> {finding.title}
        </span>
        <span style={{ color: SEVERITY_COLORS[finding.severity] ?? '#6b7280' }} className="font-bold uppercase">{finding.severity}</span>
      </div>
      <div className="mt-1 text-slate-600">{finding.description}</div>

      {/* Value comparison (req. #1, #5) */}
      {(finding.expected_value || finding.actual_value || finding.difference) && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded bg-slate-50 px-3 py-2">
          <div><span className="text-slate-400">Expected:</span> <span className="font-mono font-semibold text-green-700">{finding.expected_value ?? '—'}</span></div>
          <div><span className="text-slate-400">Actual:</span> <span className="font-mono font-semibold text-red-700">{finding.actual_value ?? '—'}</span></div>
          <div><span className="text-slate-400">Difference:</span> <span className="font-mono font-semibold text-orange-700">{finding.difference ?? '—'}</span></div>
        </div>
      )}

      {/* Location (req. #2, #3) */}
      {loc && (
        <div className="mt-2 space-y-1 rounded bg-slate-50 px-3 py-2">
          <div className="font-semibold text-slate-600">Location</div>
          {loc.module && <div className="text-slate-500">Module: <span className="font-medium text-slate-700">{loc.module}</span>{loc.submodule ? ` → ${loc.submodule}` : ''}</div>}
          {loc.database?.table && (
            <div className="text-slate-500">Database: <code className="rounded bg-white px-1">{loc.database.table}.{loc.database.field ?? '?'}</code>
              {loc.database.record_id && <span className="text-slate-400"> record: {String(loc.database.record_id).slice(0, 8)}…</span>}
              {loc.database.stored_value && <span className="text-slate-400"> = {loc.database.stored_value}</span>}
            </div>
          )}
          {loc.backend?.route && (
            <div className="text-slate-500">Backend: <code className="rounded bg-white px-1">{loc.backend.method ?? 'GET'} {loc.backend.route}</code>
              {loc.backend.service && <span className="text-slate-400"> via {loc.backend.service}</span>}
              {loc.backend.response_value && <span className="text-slate-400"> → {loc.backend.response_value}</span>}
            </div>
          )}
          {loc.frontend?.application && (
            <div className="text-slate-500">Frontend: <code className="rounded bg-white px-1">{loc.frontend.application}</code>
              {loc.frontend.component && <span className="text-slate-400"> / {loc.frontend.component}</span>}
              {loc.frontend.field && <span className="text-slate-400"> .{loc.frontend.field}</span>}
              {loc.frontend.displayed_value && <span className="text-slate-400"> = {loc.frontend.displayed_value}</span>}
            </div>
          )}
          {loc.member_number && <div className="text-slate-500">Member: <span className="font-medium text-slate-700">{loc.member_number}</span></div>}
          {loc.business_rule && <div className="text-slate-500">Business rule: <code className="rounded bg-white px-1">{loc.business_rule}</code></div>}
        </div>
      )}

      {/* Affected records + systemic flag (req. #21) */}
      {(finding.affected_records?.length > 0 || finding.is_systemic != null) && (
        <div className="mt-1 flex flex-wrap gap-2 text-slate-400">
          {finding.is_systemic != null && <span className={finding.is_systemic ? 'text-red-600' : 'text-slate-500'}>{finding.is_systemic ? '⚠ SYSTEMIC' : 'isolated'}</span>}
          {finding.affected_records?.length > 0 && <span>{finding.affected_records.length} affected: {finding.affected_records.slice(0, 5).join(', ')}{finding.affected_records.length > 5 ? '…' : ''}</span>}
          {finding.related_tables?.length > 0 && <span>tables: {finding.related_tables.join(', ')}</span>}
        </div>
      )}

      {/* Root cause + recommendation (req. #22) */}
      {finding.root_cause && (
        <div className="mt-1 text-slate-600"><span className="text-slate-400">Root cause:</span> {finding.root_cause}</div>
      )}
      {finding.recommendation && (
        <div className="mt-1 text-slate-600"><span className="text-slate-400">Recommendation:</span> {finding.recommendation}</div>
      )}

      {/* Verification (req. #10, #32) */}
      <div className="mt-1 flex flex-wrap gap-2 text-slate-400">
        <span>confidence: {finding.confidence}</span>
        <span>status: {finding.verification_status}</span>
        {finding.sources?.length > 0 && <span>sources: {finding.sources.join(', ')}</span>}
        {finding.is_verified && <span className="text-green-600">✓ verified</span>}
      </div>

      {/* Evidence (req. #3) */}
      {finding.evidence?.length > 0 && (
        <ul className="mt-1 ml-4 list-disc text-slate-400">
          {finding.evidence.map((e: any, j: number) => (
            <li key={j}>{e.source_label}{e.field ? `: ${e.field}` : ''}{e.actual_value != null ? ` = ${e.actual_value}` : ''}{e.difference ? ` (Δ ${e.difference})` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberLookupTab({ onOpen, detail, investigations }: {
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
  investigations: Investigation[];
}) {
  const verification = detail?.verification;
  const sections = verification?.sections;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">
          Member verification traces every field through DATABASE → CALCULATION → BACKEND API → MEMBER LOOKUP → FRONTEND DISPLAY
          and identifies the exact layer where values diverge (req. #15, #16). Search for a member above, then select a member-verification investigation here.
        </p>
        <div className="mt-3">
          <InvestigationsTable
            investigations={investigations.filter((i) => i.scope === 'member_verification')}
            onOpen={onOpen}
            selectedId={detail?.investigation.id}
          />
        </div>
      </div>

      {verification && <VerificationResultView result={verification} />}

      {/* Member report sections (req. #17) */}
      {sections && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sections.member_profile && <SectionCard title="Member Profile" summary={sections.member_profile.summary} items={undefined} />}
          {sections.compliance && <SectionCard title="Compliance" summary={sections.compliance.summary} items={sections.compliance.issues} />}
          {sections.financial_position && <SectionCard title="Financial Position" summary={sections.financial_position.summary} items={undefined} />}
          {sections.data_consistency && <SectionCard title="Data Consistency" summary={sections.data_consistency.summary} items={sections.data_consistency.findings} />}
          {sections.api_consistency && <SectionCard title="API Consistency" summary={sections.api_consistency.summary} items={sections.api_consistency.findings} />}
          {sections.member_lookup_consistency && <SectionCard title="Member Lookup Consistency" summary={sections.member_lookup_consistency.summary} items={sections.member_lookup_consistency.findings} />}
          {sections.business_rule_compliance && <SectionCard title="Business Rule Compliance" summary={sections.business_rule_compliance.summary} items={sections.business_rule_compliance.findings} />}
          {sections.anomalies && <SectionCard title="Anomalies" summary={sections.anomalies.summary} items={sections.anomalies.items} />}
          {sections.ai_evaluation && <SectionCard title="AI Evaluation" summary={sections.ai_evaluation.summary} items={undefined} />}
          {sections.final_evaluation && <SectionCard title="Final Evaluation" summary={sections.final_evaluation.summary} items={undefined} />}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, summary, items }: { title: string; summary: string; items?: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
      <p className="text-xs text-slate-600">{summary}</p>
      {items && items.length > 0 && (
        <ul className="mt-2 ml-4 list-disc text-xs text-slate-500">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

function EvidenceTab({ findings, onOpen, detail, investigations }: {
  findings: any[];
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
  investigations: Investigation[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Evidence — all findings with full evidence chain ({findings.length})</h3>
        {findings.length === 0 ? (
          <p className="text-xs text-slate-400">No evidence available. Select an investigation from the table below.</p>
        ) : (
          <div className="space-y-2">
            {findings.map((f, i) => <DeepFindingCard key={i} finding={f} />)}
          </div>
        )}
      </div>
      <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
    </div>
  );
}

function RecommendationsTab({ findings, onOpen, detail, investigations }: {
  findings: any[];
  onOpen: (id: string) => void;
  detail: InvestigationDetail | null;
  investigations: Investigation[];
}) {
  const withRecs = findings.filter((f) => f.recommendation || f.root_cause);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Recommendations & Root Causes ({withRecs.length})</h3>
        {withRecs.length === 0 ? (
          <p className="text-xs text-slate-400">No recommendations yet. Select an investigation from the table below.</p>
        ) : (
          <div className="space-y-2">
            {withRecs.map((f, i) => (
              <div key={i} className="rounded-md border border-slate-100 px-3 py-2 text-xs">
                <div className="font-medium text-slate-800">{f.finding_code}: {f.title}</div>
                {f.root_cause && <div className="mt-1 text-slate-600"><span className="text-slate-400">Root cause:</span> {f.root_cause}</div>}
                {f.recommendation && <div className="mt-1 text-slate-600"><span className="text-slate-400">Recommendation:</span> {f.recommendation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <InvestigationsTable investigations={investigations} onOpen={onOpen} selectedId={detail?.investigation.id} />
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
  const providerFindings = detail?.findings?.filter((f: any) => f.sources?.includes(provider)) ?? [];

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
        </div>
      </div>

      {/* PARTIAL DUAL display (req. #30) */}
      {detail && providerReports.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {label} was unavailable for this investigation.
          {detail.investigation.ai_status === 'partial' && ' This is a PARTIAL DUAL INVESTIGATION — the other provider succeeded and its report is preserved.'}
        </div>
      )}

      {detail && providerReports.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{label} Report ({detail.investigation.investigation_number})</h3>
          <ReportView report={providerReports[0]} />
          {providerFindings.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-slate-600">{label} findings with deep location</h4>
              <div className="space-y-2">{providerFindings.map((f, i) => <DeepFindingCard key={i} finding={f} />)}</div>
            </div>
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
          Select a dual-mode investigation to compare Gemini and OpenRouter findings. Disputed findings are never auto-promoted to facts (req. #10, #29).
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
          {detail.investigation.ai_status === 'partial'
            ? 'PARTIAL DUAL INVESTIGATION — only one provider succeeded. No comparison available, but the successful report is preserved (req. #30).'
            : 'No comparison available. Comparisons are produced when both Gemini and OpenRouter ran independently.'}
        </div>
      )}

      {cmp && (
        <div className="space-y-4">
          {/* Dual-mode history counts (req. #29) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <FindingCard label="Agreements" value={cmp.counts?.agreements ?? 0} color="#16a34a" />
            <FindingCard label="Gemini only" value={cmp.counts?.gemini_only ?? 0} color="#7c3aed" />
            <FindingCard label="OpenRouter only" value={cmp.counts?.openrouter_only ?? 0} color="#0891b2" />
            <FindingCard label="Disagreements" value={cmp.counts?.disagreements ?? 0} color="#dc2626" />
            <FindingCard label="Verified" value={cmp.counts?.verified ?? 0} color="#16a34a" />
            <FindingCard label="Human Review" value={cmp.counts?.human_review ?? 0} color="#ea580c" />
          </div>

          {cmp.agreements?.length > 0 && <ComparisonGroup title="✅ Agreements (found by both)" findings={cmp.agreements} tint="#f0fdf4" />}
          {cmp.gemini_only?.length > 0 && <ComparisonGroup title="✨ Gemini only" findings={cmp.gemini_only} tint="#faf5ff" />}
          {cmp.openrouter_only?.length > 0 && <ComparisonGroup title="🔀 OpenRouter only" findings={cmp.openrouter_only} tint="#ecfeff" />}
          {cmp.disagreements?.length > 0 && (
            <div className="rounded-lg border border-red-200 p-4" style={{ background: '#fef2f2' }}>
              <h4 className="mb-2 text-sm font-semibold text-red-800">⚠️ Disagreements (REQUIRES VERIFICATION — never auto-promoted to fact)</h4>
              <ul className="space-y-2">
                {cmp.disagreements.map((d: any, i: number) => (
                  <li key={i} className="rounded-md bg-white/70 px-3 py-2 text-xs">
                    <div className="font-medium text-slate-800">{d.reason}</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div><span className="text-purple-600">Gemini:</span> {d.gemini.title} ({d.gemini.severity}){d.gemini.difference ? ` Δ${d.gemini.difference}` : ''}</div>
                      <div><span className="text-cyan-600">OpenRouter:</span> {d.openrouter.title} ({d.openrouter.severity}){d.openrouter.difference ? ` Δ${d.openrouter.difference}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cmp.human_review?.length > 0 && <ComparisonGroup title="🔍 Human Review required" findings={cmp.human_review} tint="#fff7ed" />}
        </div>
      )}
    </div>
  );
}

function ComparisonGroup({ title, findings, tint, warn }: { title: string; findings: any[]; tint: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4" style={{ background: tint }}>
      <h4 className={`mb-2 text-sm font-semibold ${warn ? 'text-red-800' : 'text-slate-800'}`}>{title}</h4>
      <div className="space-y-2">
        {findings.map((f: any, i: number) => <DeepFindingCard key={i} finding={f} />)}
      </div>
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
          {detail.findings?.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-slate-600">All findings ({detail.findings.length})</h4>
              <div className="space-y-2">{detail.findings.map((f: any, i: number) => <DeepFindingCard key={i} finding={f} />)}</div>
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
          The cron endpoint <code className="rounded bg-slate-100 px-1">/api/cron/ai-investigations</code> runs due schedules every few minutes.
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
              <td>{inv.ai_status}{inv.ai_status === 'partial' ? ' ⚠' : ''}</td>
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
        <div className="mt-1 space-y-2">
          {findings.map((f: any, i: number) => <DeepFindingCard key={i} finding={f} />)}
        </div>
      </div>
    </div>
  );
}

function VerificationResultView({ result }: { result: any }) {
  const fields = result.field_results ?? [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-xs text-slate-600">
        <strong className="text-slate-700">Member Verification:</strong> {result.member_number} · score {result.verification_score}% · {result.overall_status} · {result.fields_verified}/{result.fields_checked} fields verified
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500"><tr><th className="py-1">Field</th><th>Database</th><th>Calc</th><th>API</th><th>Lookup</th><th>Display</th><th>Match</th><th>Mismatch Layer</th><th>Severity</th></tr></thead>
        <tbody>
          {fields.map((f: any, i: number) => (
            <tr key={i} className={`border-t border-slate-100 ${!f.match ? 'bg-red-50/50' : ''}`}>
              <td className="py-1 font-medium text-slate-700">{f.field}{f.frontend_component ? ` (${f.frontend_component})` : ''}</td>
              <td className="font-mono">{f.database ?? '—'}</td>
              <td className="font-mono">{f.calculation ?? '—'}</td>
              <td className="font-mono">{f.api ?? '—'}</td>
              <td className="font-mono">{f.member_lookup ?? '—'}</td>
              <td className="font-mono">{f.display ?? '—'}</td>
              <td>{f.match ? '✅' : '❌'}</td>
              <td className={f.mismatch_layer && f.mismatch_layer !== 'none' ? 'text-red-600 font-semibold' : 'text-slate-400'}>{f.mismatch_layer ?? '—'}</td>
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

