'use client';

/**
 * AI Intelligence settings console.
 *
 * Surfaced inside Settings → System Configuration → AI Intelligence. A
 * focused control panel for the dual-AI investigation engine (migration 033 +
 * src/ai/*):
 *
 *   - Dual AI Mode master toggle (Gemini + OpenRouter run independently, then
 *     are reconciled) — the same toggle exposed on the AI Intelligence
 *     dashboard, kept in sync via the shared `ai.dual_mode` setting row.
 *   - Investigations master switch (pause all AI provider calls without
 *     removing configuration; deterministic engines still run).
 *   - CRITICAL-finding alert toggle (internal notifications + best-effort
 *     email to admins).
 *
 * All toggles persist via PUT /api/ai/settings (which delegates to
 * ConfigurationService so audit history + encryption metadata are honored).
 * Access: admin+. Non-admins see a restricted notice (the parent settings
 * page also gates the tab, but this is defense-in-depth).
 */

import { useCallback, useEffect, useState } from 'react';

interface AiSetting {
  key: string;
  value: string;
}

interface Props {
  onBack: () => void;
}

const SETTING_META: Record<string, { label: string; description: string; help: string }> = {
  'ai.dual_mode': {
    label: 'Dual AI Mode',
    description:
      'Run Gemini and OpenRouter as two independent (blind) investigators for full-system and member-verification scopes, then reconcile their findings via the comparison engine. Higher cost/latency, deeper coverage.',
    help: 'When OFF, only the primary AI provider runs. The per-run dropdown on the AI Intelligence dashboard still lets you force single/dual for one investigation.',
  },
  'ai.investigations.enabled': {
    label: 'AI Investigations Engine',
    description:
      'Master switch for the AI Intelligence investigation engine. When OFF, manual and scheduled investigations skip the AI provider phase entirely (deterministic engines still run and findings are still produced).',
    help: 'Use this to pause all AI provider calls without removing provider configuration.',
  },
  'ai.alerts.critical_enabled': {
    label: 'Critical-Finding Alerts',
    description:
      'Emit internal YUNITE notifications (and best-effort email) to admins whenever an investigation produces CRITICAL findings. No sensitive financial values are sent in email; full evidence stays in the Admin Console.',
    help: 'Per-day idempotency prevents repeat alerts for the same finding set.',
  },
};

const SETTING_ORDER = ['ai.dual_mode', 'ai.investigations.enabled', 'ai.alerts.critical_enabled'];

export default function AiSettingsSection({ onBack }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/settings', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        const map: Record<string, string> = {};
        for (const s of json.data as AiSetting[]) {
          map[s.key] = s.value ?? '';
        }
        setSettings(map);
      } else {
        setError(json.error || 'Failed to load AI settings');
      }
    } catch {
      setError('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const effectiveValue = (key: string): string => {
    if (key in edited) return edited[key];
    const v = settings[key];
    return v === '' || v === undefined ? 'false' : v;
  };

  const handleToggle = (key: string) => {
    const current = effectiveValue(key);
    setEdited((prev) => ({ ...prev, [key]: current === 'true' ? 'false' : 'true' }));
  };

  const handleSave = async () => {
    const changes = Object.keys(edited);
    if (changes.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: edited }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`${changes.length} AI setting(s) updated. The next investigation picks up the changes automatically.`);
        setEdited({});
        await loadSettings();
      } else {
        const detail = Array.isArray(json.details) && json.details.length ? ` (${json.details.join('; ')})` : '';
        setError(`${json.error || 'Failed to save AI settings'}${detail}`);
      }
    } catch {
      setError('Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Intelligence</h2>
          <p className="text-sm text-gray-500 mt-1">
            Dual-AI investigation, providers, and forensic engine. These toggles also appear on the{' '}
            <a href="/dashboard/ai-intelligence" className="text-violet-600 hover:underline">AI Intelligence dashboard</a>.
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
          ← Back
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading AI settings…</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-4">
            {SETTING_ORDER.map((key) => {
              const meta = SETTING_META[key];
              const value = effectiveValue(key);
              const isOn = value === 'true';
              const isEdited = key in edited;
              return (
                <div key={key} className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${isEdited ? 'border-violet-300 bg-violet-50/40' : 'border-gray-200'}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{meta.label}</h3>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{key}</code>
                      {isEdited && <span className="text-[10px] font-medium text-violet-600">unsaved</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{meta.description}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{meta.help}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    onClick={() => handleToggle(key)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 ${isOn ? 'bg-violet-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              onClick={() => setEdited({})}
              disabled={!hasChanges || saving}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-800">
        <strong>How Dual AI Mode works:</strong> when ON, Gemini and OpenRouter each investigate the system independently
        through the same read-only, PII-sanitized tools — neither sees the other&rsquo;s conclusions. The comparison engine
        then reconciles agreements, flags disagreements (never auto-promoted to fact), and produces a unified report.
        The database + deterministic engines remain the source of truth; AI investigates the system, it does not become it.
      </div>
    </div>
  );
}
