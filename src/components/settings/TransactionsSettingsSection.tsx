'use client';

/**
 * Transactions settings console.
 *
 * Surfaced inside Settings → System Configuration → Transactions. A focused
 * control panel for the controlled financial posting engine (migration 049 +
 * src/lib/services/transactions/*):
 *
 *   - Rules engine master switch (invalid combos rejected API-side)
 *   - Duplicate-detection window (minutes)
 *   - Auto-resolve single ledger
 *   - Internal transaction-ID prefix
 *
 * All toggles persist via PUT /api/configuration (audit + history honored).
 * Access: admin+. The parent settings page gates the tab; this is
 * defense-in-depth.
 */

import { useCallback, useEffect, useState } from 'react';

interface Props {
  onBack: () => void;
  isAdmin: boolean;
  canConfigureRules: boolean;
}

interface SettingRow {
  key: string;
  value: string;
  description?: string | null;
  help_text?: string | null;
  data_type?: string;
}

const SETTING_META: Record<string, { label: string; description: string; help: string }> = {
  'transactions.rules_enabled': {
    label: 'Transaction Rules Engine',
    description: 'Master switch for the Transaction Rules Engine. When ON, every posting must satisfy a valid (category, sub-type, ledger) combination; invalid combinations are rejected by the API even if the UI is bypassed.',
    help: 'Turning this OFF restores legacy free-form posting — not recommended.',
  },
  'transactions.duplicate_window_minutes': {
    label: 'Duplicate-Detection Window (minutes)',
    description: 'Submitting the same member + amount + payment method + reference within this window triggers a "possible duplicate" warning requiring explicit confirmation.',
    help: 'Set to 0 to disable duplicate detection.',
  },
  'transactions.auto_resolve_ledger': {
    label: 'Auto-Resolve Single Ledger',
    description: 'Automatically select and show the single valid ledger for a sub-type that maps to exactly one ledger.',
    help: 'When ON, single-ledger sub-types render the ledger read-only and auto-selected.',
  },
  'transactions.transaction_id_prefix': {
    label: 'Internal Transaction ID Prefix',
    description: 'Prefix for the internal permanent transaction identifier (format: PREFIX-YYYY-#####).',
    help: 'Audit-critical; do not change after transactions exist.',
  },
};

const SETTING_ORDER = [
  'transactions.rules_enabled',
  'transactions.duplicate_window_minutes',
  'transactions.auto_resolve_ledger',
  'transactions.transaction_id_prefix',
];

async function loadByCategory(category: string): Promise<SettingRow[]> {
  const res = await fetch(`/api/configuration?category=${encodeURIComponent(category)}`, { credentials: 'include' });
  const json = await res.json();
  const raw = json.data ?? json;
  return Array.isArray(raw) ? raw : [];
}

export default function TransactionsSettingsSection({ onBack, isAdmin }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadByCategory('transactions');
      const map: Record<string, string> = {};
      for (const row of rows) map[row.key] = row.value ?? '';
      setSettings(map);
      if (!rows.length) setError('No transaction-rules settings found — run migration 049 in the Supabase SQL Editor.');
    } catch {
      setError('Could not load transactions settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setValue = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settings: { ...settings },
          reason: 'Updated transaction rules settings',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess('Transaction rules settings saved.');
      } else {
        setError(json.error || (json.details && json.details.join?.('; ')) || 'Save failed');
      }
    } catch {
      setError('Network error — settings not saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800 mb-4">← Back to Settings</button>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          Restricted — only administrators can manage transaction rules.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800 mb-4">← Back to Settings</button>
      <h2 className="text-2xl font-bold text-gray-900">Transactions — Controlled Posting Rules</h2>
      <p className="text-gray-500 mt-1 mb-6">
        Govern how the system accounts for financial events. The Transaction Rules Engine is the single source of truth used by the UI, the API, and the backend.
      </p>

      {loading ? (
        <div className="p-10 text-center text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          {error && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

          <div className="bg-white border rounded-lg divide-y">
            {SETTING_ORDER.map((key) => {
              const meta = SETTING_META[key];
              if (!meta) return null;
              const isBool = key.includes('_enabled') || key === 'transactions.auto_resolve_ledger';
              const isNumber = key === 'transactions.duplicate_window_minutes';
              return (
                <div key={key} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{meta.label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{meta.help}</p>
                  </div>
                  <div className="mt-1 shrink-0">
                    {isBool ? (
                      <button
                        type="button"
                        onClick={() => setValue(key, settings[key] === 'true' ? 'false' : 'true')}
                        className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${settings[key] === 'true' ? 'bg-green-600' : 'bg-gray-300'}`}
                        aria-pressed={settings[key] === 'true'}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key] === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    ) : (
                      <input
                        type={isNumber ? 'number' : 'text'}
                        value={settings[key] ?? ''}
                        min={isNumber ? 0 : undefined}
                        onChange={(e) => setValue(key, e.target.value)}
                        className="w-32 px-2 py-1 border border-gray-300 rounded-md text-sm text-right"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => load()} disabled={saving} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">
              Reset
            </button>
            <button onClick={saveAll} disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}