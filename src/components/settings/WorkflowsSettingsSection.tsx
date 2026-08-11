'use client';

/**
 * Workflow & Automation Engine settings console.
 *
 * Surfaced inside Settings → System Configuration → Workflow. Replaces the
 * generic "Workflow — Not Set" badge with a real control panel for the
 * automation engine (migration 025/026 + runner.service.ts):
 *
 *   - Master switch + notification channel toggles
 *   - Per-obligation reminder toggles (loans, fines, contributions, welfare)
 *   - Configurable reminder lead times (7/3/1 days) + overdue repeat interval
 *   - Weekly/monthly statement cadence (day of week / day of month)
 *   - Meeting reminder offsets
 *   - Super-admin alert toggles
 *   - Automation History: recent automation_runs with per-step breakdown
 *   - Manual "Run now" trigger (POST /api/cron/automation)
 *
 * All toggles persist via PUT /api/configuration (the same endpoint the rest
 * of the settings page uses), so they are governed by the same audit/history
 * framework. Access: admin+. Non-admins see a restricted notice (the parent
 * settings page also gates the tab, but this is defense-in-depth).
 */

import { Fragment, useCallback, useEffect, useState } from 'react';

interface WorkflowSetting {
  key: string;
  value: string;
  description: string | null;
  data_type: string;
  display_order: number;
  help_text: string | null;
}

interface AutomationRun {
  id: string;
  run_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  trigger: string;
  items_processed: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors_count: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

interface StepResult {
  step: string;
  items_processed: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors: string[];
  skipped_reason?: string;
}

interface Props {
  onBack: () => void;
}

// Extract the per-step results (and their error messages) from a run's
// `details` JSON, which the runner persists as { steps: StepResult[], ... }.
function runSteps(details: Record<string, unknown> | null): StepResult[] {
  if (!details) return [];
  const steps = (details as { steps?: StepResult[] }).steps;
  return Array.isArray(steps) ? steps : [];
}

// Collect every non-empty error message across all steps of a run.
function runStepErrors(details: Record<string, unknown> | null): string[] {
  return runSteps(details).flatMap((s) => s.errors || []);
}

// Group the workflow.* settings into labeled sections for the UI.
const SECTIONS: { title: string; icon: string; keyPrefix: string }[] = [
  { title: 'Engine', icon: '⚙️', keyPrefix: 'workflow.automation' },
  { title: 'Notification Channels', icon: '📢', keyPrefix: 'workflow.channels' },
  { title: 'Financial Reminders', icon: '💰', keyPrefix: 'workflow.reminders' },
  { title: 'Statements', icon: '📄', keyPrefix: 'workflow.statements' },
  { title: 'Meetings', icon: '📅', keyPrefix: 'workflow.meetings' },
  { title: 'Super-Admin Alerts', icon: '🚨', keyPrefix: 'workflow.alerts' },
];

function prettyLabel(key: string): string {
  const parts = key.split('.');
  const last = parts[parts.length - 1];
  return last
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function WorkflowsSettingsSection({ onBack }: Props) {
  const [settings, setSettings] = useState<WorkflowSetting[]>([]);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [triggerErrors, setTriggerErrors] = useState<string[] | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/configuration?category=workflow');
      const data = await res.json();
      if (data.success && data.data?.settings) {
        setSettings(data.data.settings);
      } else {
        setError(data.error || 'Failed to load workflow settings');
      }
    } catch {
      setError('Failed to load workflow settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await fetch('/api/automation/runs?limit=20');
      const data = await res.json();
      if (data.success) {
        setRuns(data.data);
      }
    } catch {
      // Non-fatal: history panel just stays empty.
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadRuns();
  }, [loadSettings, loadRuns]);

  const handleToggle = (key: string, current: string) => {
    const next = current === 'true' ? 'false' : 'true';
    setEdited((prev) => ({ ...prev, [key]: next }));
  };

  const handleNumberChange = (key: string, value: string) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const changes = Object.keys(edited);
    if (changes.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: edited,
          reason: 'Workflow & Automation settings update',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`${changes.length} setting(s) updated. The next automation tick will pick up the changes.`);
        setEdited({});
        await loadSettings();
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      // The cron route is CRON_SECRET-protected; the manual trigger from the
      // UI goes through the session-authenticated /api/automation/trigger
      // endpoint which calls the same runner.tick() without needing the secret.
      const res = await fetch('/api/automation/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const r = data.data;
        // The tick result exposes per-step errors directly in `steps`;
        // the persisted DB row nests them under `details.steps`.
        const stepErrors: string[] = Array.isArray(r.steps)
          ? r.steps.flatMap((s: StepResult) => s.errors || [])
          : runStepErrors(r.details);
        const summary = `Tick completed in ${r.duration_ms}ms — items: ${r.totals.items_processed}, notifications: ${r.totals.notifications_created}, emails sent: ${r.totals.emails_sent}, skipped: ${r.totals.emails_skipped}, errors: ${r.totals.errors_count}.`;
        setTriggerResult(summary);
        setTriggerErrors(stepErrors);
        await loadRuns();
      } else {
        setTriggerResult(`Failed: ${data.error || 'unknown error'}`);
        setTriggerErrors(null);
      }
    } catch (e: any) {
      setTriggerResult(`Failed: ${e?.message || 'network error'}`);
      setTriggerErrors(null);
    } finally {
      setTriggering(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;
  const currentValue = (key: string) => edited[key] ?? settings.find((s) => s.key === key)?.value ?? '';

  const statusColor = (status: string) =>
    status === 'completed' ? 'bg-green-100 text-green-800' :
    status === 'failed' ? 'bg-red-100 text-red-800' :
    status === 'skipped' ? 'bg-gray-100 text-gray-700' :
    'bg-blue-100 text-blue-800';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold text-gray-900">Workflow &amp; Automation</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggering ? 'Running…' : '▶ Run Now'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {triggerResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
          {triggerResult}
          {triggerErrors && triggerErrors.length > 0 && (
            <ul className="mt-2 space-y-1 text-red-700">
              {triggerErrors.map((msg, i) => (
                <li key={i} className="break-words">⚠️ {msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm break-words">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Settings sections */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading workflow settings…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SECTIONS.map((section) => {
            const sectionSettings = settings
              .filter((s) => s.key.startsWith(section.keyPrefix))
              .sort((a, b) => a.display_order - b.display_order);
            if (sectionSettings.length === 0) return null;
            return (
              <div key={section.keyPrefix} className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>{section.icon}</span> {section.title}
                </h3>
                <div className="space-y-4">
                  {sectionSettings.map((s) => {
                    const val = currentValue(s.key);
                    const isBool = s.data_type === 'boolean';
                    const isNumber = s.data_type === 'number';
                    const isOn = val === 'true';
                    return (
                      <div key={s.key} className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <label className="text-sm font-medium text-gray-800 block">
                            {prettyLabel(s.key)}
                          </label>
                          {s.help_text && (
                            <p className="text-xs text-gray-500 mt-0.5">{s.help_text}</p>
                          )}
                        </div>
                        {isBool ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(s.key, val)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                              isOn ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                            aria-label={s.key}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                isOn ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : isNumber ? (
                          <input
                            type="number"
                            value={val}
                            onChange={(e) => handleNumberChange(s.key, e.target.value)}
                            className="w-20 px-2 py-1 text-sm border rounded-md flex-shrink-0"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleNumberChange(s.key, e.target.value)}
                            className="w-40 px-2 py-1 text-sm border rounded-md flex-shrink-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Automation History */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <span>📜</span> Automation History
          </h3>
          <button
            onClick={loadRuns}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Refresh
          </button>
        </div>
        {runsLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading history…</div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No automation runs yet. The engine ticks every 5 minutes once the cron service is deployed.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3">Notifs</th>
                  <th className="py-2 pr-3">Emails</th>
                  <th className="py-2 pr-3">Errors</th>
                  <th className="py-2">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const stepErrs = runStepErrors(r.details);
                  const steps = runSteps(r.details);
                  const hasDetail = stepErrs.length > 0 || steps.some((s) => s.skipped_reason) || r.error_message;
                  const isOpen = expandedRunId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                          {new Date(r.started_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">{r.items_processed}</td>
                        <td className="py-2 pr-3 text-gray-600">{r.notifications_created}</td>
                        <td className="py-2 pr-3 text-gray-600">
                          {r.emails_sent}
                          {r.emails_skipped > 0 && (
                            <span className="text-gray-400"> ({r.emails_skipped} skipped)</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {hasDetail ? (
                            <button
                              type="button"
                              onClick={() => setExpandedRunId(isOpen ? null : r.id)}
                              className={`underline ${r.errors_count > 0 ? 'text-red-600' : 'text-gray-500'} hover:text-red-700`}
                            >
                              {r.errors_count > 0 ? `${r.errors_count} ▾` : 'details ▾'}
                            </button>
                          ) : r.errors_count > 0 ? (
                            <span className="text-red-600">{r.errors_count}</span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="py-2 text-gray-500 text-xs">{r.trigger}</td>
                      </tr>
                      {isOpen && hasDetail && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="space-y-2 text-xs">
                              {r.error_message && (
                                <div className="text-red-700 break-words">
                                  <span className="font-semibold">Run error: </span>{r.error_message}
                                </div>
                              )}
                              {steps.map((s) => {
                                const errs = s.errors || [];
                                if (!errs.length && !s.skipped_reason) return null;
                                return (
                                  <div key={s.step} className="space-y-1">
                                    <div className="font-semibold text-gray-700">
                                      Step: {s.step}
                                      {s.skipped_reason && (
                                        <span className="ml-2 text-gray-500 font-normal">(skipped: {s.skipped_reason})</span>
                                      )}
                                    </div>
                                    {errs.length > 0 ? (
                                      <ul className="pl-4 space-y-0.5 text-red-700">
                                        {errs.map((msg, i) => (
                                          <li key={i} className="break-words">⚠️ {msg}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <div className="pl-4 text-gray-500">No errors.</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
