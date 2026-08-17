'use client';

import { useEffect, useState } from 'react';

/**
 * Settings section for the Member Pre-Registration / Smart Auto-Fill system.
 *
 * Shows the public registration URL (derived from this deployment) with a
 * copy button + an optional QR code (rendered from the public Google Chart
 * API-free, pure-SVG QR via the `qrserver.com` public endpoint OR, when
 * offline, a copyable URL). Toggles for opening the form and admin
 * notifications are saved through the existing PUT /api/configuration route.
 */

interface ConfigRow {
  key: string;
  value: string;
  help_text?: string | null;
  data_type?: string | null;
}

interface Props {
  onBack: () => void;
  isAdmin: boolean;
  configRows: ConfigRow[];
  publicUrl: string;
  onSaveConfig: (key: string, value: string) => Promise<void>;
}

export default function RegistrationSettingsSection({
  onBack,
  isAdmin,
  configRows,
  publicUrl,
  onSaveConfig,
}: Props) {
  const getVal = (key: string) => configRows.find((r) => r.key === key)?.value ?? '';
  const [publicEnabled, setPublicEnabled] = useState(getVal('registration.public_enabled') === 'true');
  const [notifyAdmins, setNotifyAdmins] = useState(getVal('registration.notify_admins') === 'true');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setPublicEnabled(getVal('registration.public_enabled') === 'true');
    setNotifyAdmins(getVal('registration.notify_admins') === 'true');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configRows]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const save = async (key: string, value: string) => {
    setSaving(key);
    try {
      await onSaveConfig(key, value);
    } finally {
      setSaving(null);
    }
  };

  const togglePublic = async () => {
    const next = !publicEnabled;
    setPublicEnabled(next);
    await save('registration.public_enabled', String(next));
  };

  const toggleNotify = async () => {
    const next = !notifyAdmins;
    setNotifyAdmins(next);
    await save('registration.notify_admins', String(next));
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Member Registration</h2>
          <p className="text-gray-500 mt-1">
            Public pre-registration form and bulk-registration helper settings.
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          ← Back
        </button>
      </div>

      {/* Public registration URL + QR */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Public Registration Link</h3>
        <p className="text-sm text-gray-500 mb-4">
          Share this link with prospective members. They submit their information, which is stored as
          a pending application — it does NOT create a member until an administrator registers them via
          the &quot;Auto-fill from Submitted Registrations&quot; helper on the Members page.
        </p>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Registration URL</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-mono text-sm"
              />
              <button
                onClick={copyUrl}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium whitespace-nowrap"
              >
                {copied ? '✓ Copied' : 'Copy Link'}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePublic}
                disabled={!isAdmin}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  publicEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    publicEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Public form {publicEnabled ? 'open' : 'closed'}
                </div>
                <div className="text-xs text-gray-500">
                  When closed, the public form refuses new submissions.
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={toggleNotify}
                disabled={!isAdmin}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifyAdmins ? 'bg-indigo-600' : 'bg-gray-300'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notifyAdmins ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <div>
                <div className="text-sm font-medium text-gray-900">Admin notifications</div>
                <div className="text-xs text-gray-500">
                  Notify admins in-app when a new submission arrives.
                </div>
              </div>
            </div>
            {saving && <div className="text-xs text-gray-400 mt-2">Saving…</div>}
          </div>
          <div className="flex flex-col items-center">
            <div className="text-xs text-gray-500 mb-2">Scan to submit</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code for member registration URL"
              width={200}
              height={200}
              className="border border-gray-200 rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="text-[10px] text-gray-400 mt-1 text-center max-w-[200px] break-all">
              {publicUrl}
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">How bulk registration works</h3>
        <ol className="space-y-2 text-sm text-gray-700">
          <li><strong>1.</strong> Share the registration link (or QR code) with prospective members.</li>
          <li><strong>2.</strong> Members submit their information through the public form — stored as pending applications (no member created).</li>
          <li><strong>3.</strong> Open <em>Members → Register Member → Auto-fill from Submitted Registrations</em>.</li>
          <li><strong>4.</strong> Select an applicant; the existing registration form is populated. Review and edit if needed.</li>
          <li><strong>5.</strong> Click <em>Register Member</em> — the existing YUNITE registration engine runs (member, accounts, workspace, compliance, notifications).</li>
          <li><strong>6.</strong> The submission is marked <em>Registered</em> and linked to the new member — it cannot be registered twice.</li>
        </ol>
      </div>
    </div>
  );
}
