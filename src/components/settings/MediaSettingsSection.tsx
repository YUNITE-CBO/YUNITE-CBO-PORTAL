'use client';

/**
 * Media & Assets settings section.
 *
 * Surfaced inside Settings → System Configuration → Media & Assets. The
 * control panel for the YUNITE Media Engine:
 *   - Organization logo uploader (the single org logo consumed by every
 *     module + embedded in generated PDF documents).
 *   - Media config form (upload limit / allowed types / bucket names) —
 *     rendered from the `media.*` settings rows via the standard settings
 *     save flow (PUT /api/configuration), so audit/history is honored.
 *   - Media integrity check (DB-vs-storage discrepancies) for admins.
 */

import { useState } from 'react';
import { YuniteImageUploader } from '@/components/media/YuniteImageUploader';

export function MediaSettingsSection({
  onBack,
  isSuperAdmin,
  configRows,
  onSaveConfig,
}: {
  onBack: () => void;
  isSuperAdmin: boolean;
  /** The media.* settings rows for the current category. */
  configRows: Array<{ key: string; value: string; help_text?: string | null; data_type?: string | null }>;
  /** Persist a setting value (delegates to PUT /api/configuration). */
  onSaveConfig: (key: string, value: string) => Promise<void>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [integrity, setIntegrity] = useState<any[] | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  const runIntegrity = async () => {
    setIntegrityLoading(true);
    try {
      const res = await fetch('/api/media/integrity');
      const data = await res.json();
      setIntegrity(data.findings || []);
    } catch {
      setIntegrity([]);
    } finally {
      setIntegrityLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Media &amp; Assets</h2>
          <p className="text-sm text-gray-600 mt-1">
            Centralized media engine. Upload once, reuse everywhere — the organization logo is
            embedded in generated PDF documents and shown across the portal.
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
          ← Back
        </button>
      </div>

      {/* Organization logo */}
      <YuniteImageUploader
        ownerType="organization"
        ownerId="default"
        assetType="ORGANIZATION_LOGO"
        label="Organization Logo"
        fallbackName="YUNITE PAMOJA CBO"
        variant="logo"
      />

      {/* Media configuration (upload limit / allowed types / buckets) */}
      {configRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Engine Configuration</h3>
          <div className="space-y-4">
            {configRows.map((row) => {
              const val = drafts[row.key] ?? row.value ?? '';
              const isNumber = row.data_type === 'number';
              return (
                <div key={row.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {row.key}
                    {row.help_text && <span className="font-normal text-gray-400"> — {row.help_text}</span>}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={isNumber ? 'number' : 'text'}
                      value={val}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#0B2A4A]"
                    />
                    <button
                      onClick={async () => {
                        setSavingKey(row.key);
                        try { await onSaveConfig(row.key, val); } finally { setSavingKey(null); }
                      }}
                      disabled={savingKey === row.key}
                      className="px-3 py-1.5 text-xs bg-[#0B2A4A] text-white rounded-lg hover:bg-[#0B2A4A]/90 disabled:opacity-50"
                    >{savingKey === row.key ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Integrity check (admin) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Media Integrity Check</h3>
            <button
              onClick={runIntegrity}
              disabled={integrityLoading}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >{integrityLoading ? 'Checking…' : 'Run Check'}</button>
          </div>
          {integrity !== null && (
            integrity.length === 0 ? (
              <p className="text-xs text-green-700">All media assets are consistent — no missing storage objects detected.</p>
            ) : (
              <ul className="space-y-2">
                {integrity.map((f, i) => (
                  <li key={i} className={`text-xs p-2 rounded border ${f.severity === 'critical' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                    <span className="font-semibold">{f.severity.toUpperCase()}</span> — {f.detail}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}
