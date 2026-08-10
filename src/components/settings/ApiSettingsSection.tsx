'use client';

/**
 * API Keys & Gateway management console.
 *
 * Surfaced inside Settings → System Configuration → API Keys. It is the
 * admin-portal UI for the YUNITE API gateway (/api/v1), driving the same
 * services that the /api/v1/management/* endpoints expose:
 *
 *   - API clients (create, update, suspend, manage scopes)
 *   - API keys (generate, shown once, revoke)
 *   - Endpoint overrides (enable/disable, per-minute rate-limit)
 *   - Request logs (filterable observability)
 *   - Gateway overview (health, 24h totals, top errors)
 *
 * Access is enforced server-side: every /api/v1/management/* endpoint is
 * super_admin-only via the gateway manifest. This component additionally
 * hides itself for non-super-admins so the UI is not offered to them.
 */

import { useCallback, useEffect, useState } from 'react';

interface ApiClient {
  id: string;
  name: string;
  slug: string;
  client_type: 'admin_portal' | 'lookup' | 'mobile' | 'third_party';
  status: 'active' | 'inactive' | 'suspended';
  description: string | null;
  default_tier: 'public' | 'standard' | 'privileged';
  created_at: string;
  permissions?: { module: string; action: string }[];
}

interface ApiKey {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  status: 'active' | 'revoked' | 'expired' | 'rotating';
  environment: 'live' | 'test';
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  key?: string; // only present right after generation
}

interface EndpointSpec {
  id: string;
  method: string;
  path: string;
  module: string;
  action: string;
  summary: string;
  auth: string;
  minRole?: string;
  financial?: boolean;
  is_active: boolean;
  rate_limit_per_minute: number | null;
  rateLimitPerMinute?: number;
}

interface Overview {
  status: string;
  database: string;
  version: string;
  endpoint_count: number;
  active_endpoints: number;
  active_clients: number;
  active_keys: number;
  totals: {
    requests_24h: number;
    errors_24h: number;
    rate_limited_24h: number;
    auth_failures_24h: number;
    avg_response_ms_24h: number;
  };
  top_errors: { error_code: string; count: number }[];
  requests_by_status: { status: string; count: number }[];
}

interface LogEntry {
  id: string;
  request_id: string;
  client_name: string | null;
  user_email: string | null;
  auth_mode: string;
  method: string;
  path: string;
  endpoint_id: string | null;
  status_code: number;
  duration_ms: number;
  error_code: string | null;
  created_at: string;
}

interface Scope {
  module: string;
  action: string;
  label: string;
}

type Tab = 'overview' | 'clients' | 'keys' | 'endpoints' | 'logs';

const CLIENT_TYPES: { value: string; label: string }[] = [
  { value: 'third_party', label: 'Third Party' },
  { value: 'lookup', label: 'Lookup' },
  { value: 'mobile', label: 'Mobile' },
];
const TIERS = [
  { value: 'public', label: 'Public' },
  { value: 'standard', label: 'Standard' },
  { value: 'privileged', label: 'Privileged' },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || data.error || `Request failed (${res.status})`);
  }
  return data.data as T;
}

export default function ApiSettingsSection({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointSpec[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);

  // Client form
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<ApiClient | null>(null);
  const [clientForm, setClientForm] = useState({
    name: '', slug: '', client_type: 'third_party', description: '', default_tier: 'standard',
  });
  const [clientScopes, setClientScopes] = useState<Set<string>>(new Set());
  const [showScopesEditor, setShowScopesEditor] = useState(false);

  // Key form
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyForm, setKeyForm] = useState({ client_id: '', name: '', environment: 'live', expires_at: '' });
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const flash = useCallback((setter: (s: string | null) => void, msg: string) => {
    setter(msg);
    setTimeout(() => setter(null), 5000);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<Overview>('/api/v1/management/overview');
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    }
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ApiClient[]>('/api/v1/management/clients');
      setClients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ApiKey[]>('/api/v1/management/keys');
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const [data, scopeData] = await Promise.all([
        api<EndpointSpec[]>('/api/v1/management/endpoints'),
        api<{ available_scopes: Scope[] } | Scope[]>('/api/v1/docs').then((d) =>
          Array.isArray(d) ? d : (d as { available_scopes: Scope[] }).available_scopes
        ),
      ]);
      setEndpoints(data);
      setScopes(scopeData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load endpoints');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/management/logs?page=${page}&limit=25`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setLogsTotal(data.pagination?.total ?? 0);
        setLogsPage(page);
      } else {
        setError(data.error?.message || 'Failed to load logs');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setError(null);
    if (tab === 'overview') loadOverview();
    else if (tab === 'clients') loadClients();
    else if (tab === 'keys') loadKeys();
    else if (tab === 'endpoints') loadEndpoints();
    else if (tab === 'logs') loadLogs(1);
  }, [tab, loadOverview, loadClients, loadKeys, loadEndpoints, loadLogs]);

  const openCreateClient = () => {
    setEditingClient(null);
    setClientForm({ name: '', slug: '', client_type: 'third_party', description: '', default_tier: 'standard' });
    setClientScopes(new Set());
    setShowClientForm(true);
    setShowScopesEditor(false);
  };

  const openEditClient = async (client: ApiClient) => {
    try {
      const full = await api<ApiClient & { permissions: { module: string; action: string }[] }>(
        `/api/v1/management/clients/${client.id}`
      );
      setEditingClient(full);
      setClientForm({
        name: full.name,
        slug: full.slug,
        client_type: full.client_type === 'admin_portal' ? 'third_party' : full.client_type,
        description: full.description || '',
        default_tier: full.default_tier,
      });
      setClientScopes(new Set((full.permissions || []).map((p) => `${p.module}.${p.action}`)));
      setShowClientForm(true);
      setShowScopesEditor(true);
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to load client');
    }
  };

  const saveClient = async () => {
    setError(null);
    try {
      if (editingClient) {
        await api(`/api/v1/management/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clientForm.name,
            description: clientForm.description || null,
            default_tier: clientForm.default_tier,
          }),
        });
        if (showScopesEditor) {
          await api(`/api/v1/management/clients/${editingClient.id}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: Array.from(clientScopes) }),
          });
        }
        flash(setSuccess, 'Client updated');
      } else {
        if (!clientForm.name || !clientForm.slug) {
          flash(setError, 'Name and slug are required');
          return;
        }
        const created = await api<ApiClient>('/api/v1/management/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clientForm.name,
            slug: clientForm.slug,
            client_type: clientForm.client_type,
            description: clientForm.description || undefined,
            default_tier: clientForm.default_tier,
            permissions: Array.from(clientScopes),
          }),
        });
        flash(setSuccess, `Client "${created.name}" created`);
      }
      setShowClientForm(false);
      loadClients();
      loadOverview();
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to save client');
    }
  };

  const toggleClientStatus = async (client: ApiClient) => {
    const next = client.status === 'active' ? 'inactive' : 'active';
    try {
      await api(`/api/v1/management/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      loadClients();
      flash(setSuccess, `Client ${next === 'active' ? 'activated' : 'deactivated'}`);
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to update client');
    }
  };

  const generateKey = async () => {
    setError(null);
    if (!keyForm.client_id || !keyForm.name) {
      flash(setError, 'Client and key name are required');
      return;
    }
    try {
      const result = await api<ApiKey>('/api/v1/management/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: keyForm.client_id,
          name: keyForm.name,
          environment: keyForm.environment,
          expires_at: keyForm.expires_at || undefined,
        }),
      });
      setNewKey(result);
      setShowKeyForm(false);
      setKeyForm({ client_id: '', name: '', environment: 'live', expires_at: '' });
      loadKeys();
      loadOverview();
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to generate key');
    }
  };

  const revokeKey = async (key: ApiKey) => {
    if (!confirm(`Revoke key "${key.name}" (${key.key_prefix})? This cannot be undone.`)) return;
    try {
      await api(`/api/v1/management/keys/${key.id}`, { method: 'DELETE' });
      loadKeys();
      loadOverview();
      flash(setSuccess, 'Key revoked');
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to revoke key');
    }
  };

  const toggleScope = (label: string) => {
    setClientScopes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleEndpoint = async (ep: EndpointSpec) => {
    try {
      await api(`/api/v1/management/endpoints/${ep.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !ep.is_active, rate_limit_per_minute: ep.rate_limit_per_minute }),
      });
      loadEndpoints();
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to update endpoint');
    }
  };

  const updateEndpointRateLimit = async (ep: EndpointSpec, value: string) => {
    const n = value === '' ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n <= 0)) {
      flash(setError, 'Rate limit must be a positive number');
      return;
    }
    try {
      await api(`/api/v1/management/endpoints/${ep.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: ep.is_active, rate_limit_per_minute: n }),
      });
      loadEndpoints();
    } catch (e) {
      flash(setError, e instanceof Error ? e.message : 'Failed to update rate limit');
    }
  };

  const copyKey = () => {
    if (newKey?.key) {
      navigator.clipboard.writeText(newKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'clients', label: 'API Clients', icon: '🔌' },
    { id: 'keys', label: 'API Keys', icon: '🔑' },
    { id: 'endpoints', label: 'Endpoints', icon: '🛣️' },
    { id: 'logs', label: 'Request Logs', icon: '📋' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">← Back</button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">API Keys &amp; Gateway</h2>
            <p className="text-sm text-gray-500">Manage API access, clients, keys, scopes, endpoint overrides, and observability for the YUNITE API gateway.</p>
          </div>
        </div>
        <a href="/dashboard/api-docs" target="_blank" rel="noreferrer" className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          View API Docs →
        </a>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg break-words">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>}

      {/* New key banner */}
      {newKey?.key && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-bold text-amber-900">Your API key — copy it now</h3>
              <p className="text-sm text-amber-800 mt-1">This is the only time the raw key will be shown. It is stored hashed and cannot be retrieved again.</p>
              <div className="mt-3 flex gap-2">
                <code className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-mono break-all">{newKey.key}</code>
                <button onClick={copyKey} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 whitespace-nowrap">
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button onClick={() => setNewKey(null)} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {/* OVERVIEW */}
      {tab === 'overview' && overview && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Status" value={overview.status} color={overview.status === 'healthy' ? 'green' : 'red'} />
            <Stat label="Database" value={overview.database} color={overview.database === 'connected' ? 'green' : 'red'} />
            <Stat label="Endpoints" value={String(overview.endpoint_count)} color="gray" />
            <Stat label="API Version" value={overview.version} color="gray" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Active Clients" value={String(overview.active_clients)} color="indigo" />
            <Stat label="Active Keys" value={String(overview.active_keys)} color="indigo" />
            <Stat label="Requests (24h)" value={String(overview.totals.requests_24h)} color="gray" />
            <Stat label="Avg Response (24h)" value={`${overview.totals.avg_response_ms_24h}ms`} color="gray" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Errors (24h)" value={String(overview.totals.errors_24h)} color="red" />
            <Stat label="Rate Limited (24h)" value={String(overview.totals.rate_limited_24h)} color="red" />
            <Stat label="Auth Failures (24h)" value={String(overview.totals.auth_failures_24h)} color="red" />
            <Stat label="Top Error" value={overview.top_errors[0]?.error_code ?? '—'} color="gray" />
          </div>

          {overview.top_errors.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Top Errors (24h)</h3>
              <div className="space-y-2">
                {overview.top_errors.map((e) => (
                  <div key={e.error_code} className="flex justify-between text-sm">
                    <code className="text-gray-700">{e.error_code}</code>
                    <span className="text-gray-500">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CLIENTS */}
      {tab === 'clients' && !loading && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreateClient} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">+ New Client</button>
          </div>

          {showClientForm && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingClient ? `Edit: ${editingClient.name}` : 'Create API Client'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name">
                  <input type="text" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="input" disabled={!!editingClient && editingClient.slug === 'admin-portal'} />
                </Field>
                <Field label="Slug (lowercase, no spaces)">
                  <input type="text" value={clientForm.slug} onChange={(e) => setClientForm({ ...clientForm, slug: e.target.value })} className="input" disabled={!!editingClient} placeholder="my-mobile-app" />
                </Field>
                <Field label="Client Type">
                  <select value={clientForm.client_type} onChange={(e) => setClientForm({ ...clientForm, client_type: e.target.value })} className="input" disabled={!!editingClient}>
                    {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Default Tier">
                  <select value={clientForm.default_tier} onChange={(e) => setClientForm({ ...clientForm, default_tier: e.target.value })} className="input">
                    {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea value={clientForm.description} onChange={(e) => setClientForm({ ...clientForm, description: e.target.value })} className="input" rows={2} />
                  </Field>
                </div>
              </div>

              {showScopesEditor && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">Permission Scopes</h4>
                    <span className="text-xs text-gray-500">{clientScopes.size} selected</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-50">
                    {scopes.map((s) => (
                      <label key={s.label} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={clientScopes.has(s.label)} onChange={() => toggleScope(s.label)} className="h-4 w-4" />
                        <code className="text-gray-700">{s.label}</code>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowClientForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={saveClient} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">{editingClient ? 'Save Changes' : 'Create Client'}</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border divide-y">
            {clients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No API clients yet.</div>
            ) : clients.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{c.slug}</code>
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-gray-400">{c.client_type} · {c.default_tier}</span>
                  </div>
                  {c.description && <p className="text-sm text-gray-500 mt-1">{c.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">Created {fmtDate(c.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  {c.slug !== 'admin-portal' && (
                    <>
                      <button onClick={() => openEditClient(c)} className="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg">Edit</button>
                      <button onClick={() => toggleClientStatus(c)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                        {c.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </>
                  )}
                  {c.slug === 'admin-portal' && <span className="text-xs text-gray-400 px-3 py-1.5">Built-in</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KEYS */}
      {tab === 'keys' && !loading && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowKeyForm(true); setKeyForm({ client_id: clients[0]?.id || '', name: '', environment: 'live', expires_at: '' }); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              disabled={clients.filter((c) => c.status === 'active' && c.slug !== 'admin-portal').length === 0}
            >
              + Generate Key
            </button>
          </div>

          {showKeyForm && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Generate API Key</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Client">
                  <select value={keyForm.client_id} onChange={(e) => setKeyForm({ ...keyForm, client_id: e.target.value })} className="input">
                    <option value="">Select client…</option>
                    {clients.filter((c) => c.status === 'active' && c.slug !== 'admin-portal').map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Key Name">
                  <input type="text" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} className="input" placeholder="Production mobile key" />
                </Field>
                <Field label="Environment">
                  <select value={keyForm.environment} onChange={(e) => setKeyForm({ ...keyForm, environment: e.target.value as 'live' | 'test' })} className="input">
                    <option value="live">Live (yk_live_)</option>
                    <option value="test">Test (yk_test_)</option>
                  </select>
                </Field>
                <Field label="Expiry (optional)">
                  <input type="date" value={keyForm.expires_at} onChange={(e) => setKeyForm({ ...keyForm, expires_at: e.target.value })} className="input" />
                </Field>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowKeyForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={generateKey} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Generate</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border divide-y">
            {keys.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No API keys issued.</div>
            ) : keys.map((k) => (
              <div key={k.id} className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{k.name}</span>
                    <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{k.key_prefix}</code>
                    <StatusBadge status={k.status} />
                    <span className="text-xs text-gray-400">{k.environment}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Created {fmtDate(k.created_at)}
                    {k.expires_at && ` · Expires ${fmtDate(k.expires_at)}`}
                    {k.last_used_at && ` · Last used ${fmtDate(k.last_used_at)}`}
                  </p>
                </div>
                {k.status === 'active' && (
                  <button onClick={() => revokeKey(k)} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">Revoke</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENDPOINTS */}
      {tab === 'endpoints' && !loading && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            Toggle endpoints on/off or override their per-minute rate limit without a code change. The manifest remains the source of truth for metadata; this only overrides runtime behaviour.
          </div>
          <div className="bg-white rounded-xl border divide-y">
            {endpoints.map((ep) => (
              <div key={ep.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${methodColor(ep.method)}`}>{ep.method}</span>
                    <code className="text-sm text-gray-700 truncate">{ep.path}</code>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{ep.summary} · {ep.module}.{ep.action} {ep.financial && '· 💰 financial'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="number"
                    placeholder={String(ep.rateLimitPerMinute ?? 'default')}
                    value={ep.rate_limit_per_minute ?? ''}
                    onChange={(e) => updateEndpointRateLimit(ep, e.target.value)}
                    className="w-24 px-2 py-1 text-sm border rounded"
                    title="Per-minute rate limit override"
                  />
                  <button
                    onClick={() => toggleEndpoint(ep)}
                    className={`px-3 py-1.5 text-xs rounded-lg ${ep.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                  >
                    {ep.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LOGS */}
      {tab === 'logs' && !loading && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Time', 'Method', 'Path', 'Status', 'Auth', 'Client/User', 'Duration', 'Endpoint'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">No requests logged.</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="text-xs">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                    <td className="px-3 py-2"><span className={`font-mono px-1.5 py-0.5 rounded ${methodColor(l.method)}`}>{l.method}</span></td>
                    <td className="px-3 py-2 text-gray-700 font-mono truncate max-w-[200px]">{l.path}</td>
                    <td className={`px-3 py-2 font-medium ${l.status_code < 400 ? 'text-green-600' : 'text-red-600'}`}>{l.status_code}</td>
                    <td className="px-3 py-2 text-gray-500">{l.auth_mode}</td>
                    <td className="px-3 py-2 text-gray-500">{l.client_name || l.user_email || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{l.duration_ms}ms</td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{l.endpoint_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logsTotal > 25 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Page {logsPage} · {logsTotal} total</span>
              <div className="flex gap-2">
                <button disabled={logsPage <= 1} onClick={() => loadLogs(logsPage - 1)} className="px-3 py-1.5 text-sm border rounded disabled:opacity-50">Prev</button>
                <button disabled={logsPage * 25 >= logsTotal} onClick={() => loadLogs(logsPage + 1)} className="px-3 py-1.5 text-sm border rounded disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-600', red: 'text-red-600', gray: 'text-gray-900', indigo: 'text-indigo-600',
  };
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={`text-2xl font-bold ${colors[color] || 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-700',
    revoked: 'bg-red-100 text-red-700',
    expired: 'bg-yellow-100 text-yellow-700',
    rotating: 'bg-blue-100 text-blue-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-amber-100 text-amber-700',
    PATCH: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
  };
  return map[method.toUpperCase()] || 'bg-gray-100 text-gray-700';
}
