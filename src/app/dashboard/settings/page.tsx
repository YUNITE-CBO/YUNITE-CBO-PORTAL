'use client';

import { useEffect, useState, useCallback } from 'react';

interface OrganizationSettings {
  name: string;
  registration_number: string;
  email: string;
  phone: string;
  address: string;
}

interface FinancialSettings {
  share_value: string;
  registration_fee: string;
  annual_fee: string;
  loan_interest_rate: string;
  maximum_loan_amount: string;
  minimum_shares: string;
  meeting_attendance_fine: string;
}

interface MembershipSettings {
  minimum_age: string;
  maximum_members: string;
  require_guarantor: boolean;
  grace_period_days: string;
}

interface SettingsData {
  organization: OrganizationSettings;
  financial: FinancialSettings;
  membership: MembershipSettings;
}

interface DataStats {
  will_be_deleted: {
    transactions: number;
    loans: number;
    fines: number;
    campaigns: number;
    accounts: number;
    documents: number;
    compliance_records: number;
    meetings: number;
    notifications: number;
    reports: number;
    members: number;
    users: number;
    roles: number;
  };
  will_be_preserved: {
    members: number;
  };
}

interface ResetLevel {
  id: string;
  name: string;
  description: string;
  affected_tables: string[];
  preserved_tables: string[];
}

interface SystemState {
  savings_balance: number;
  contributions_balance: number;
  loans_balance: number;
  fines_balance: number;
  welfare_balance: number;
  accounts_count: number;
}

interface ResetProgress {
  phase: string;
  progress: number;
  totalPhases: number;
  currentPhase: number;
  details?: string;
}

type ResetStep = 
  | 'select_level'
  | 'review_impact'
  | 'security_verify'
  | 'backup_confirm'
  | 'countdown'
  | 'executing'
  | 'complete'
  | 'failed';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'organization' | 'financial' | 'membership' | 'system'>('organization');
  
  // Database Reset state
  const [showResetWizard, setShowResetWizard] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('select_level');
  const [selectedLevel, setSelectedLevel] = useState<ResetLevel | null>(null);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [resetLevels, setResetLevels] = useState<ResetLevel[]>([]);
  const [impactSummary, setImpactSummary] = useState<any>(null);
  
  // Reset form state
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [backupVerified, setBackupVerified] = useState(false);
  const [archiveInsteadOfDelete, setArchiveInsteadOfDelete] = useState(true);
  const [deleteAuditLogs, setDeleteAuditLogs] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [resetProgress, setResetProgress] = useState<ResetProgress | null>(null);
  const [resetResult, setResetResult] = useState<any>(null);
  const [userId, setUserId] = useState<string>('00000000-0000-0000-0000-000000000000');
  const [settings, setSettings] = useState<SettingsData>({
    organization: {
      name: '',
      registration_number: '',
      email: '',
      phone: '',
      address: '',
    },
    financial: {
      share_value: '100',
      registration_fee: '1000',
      annual_fee: '500',
      loan_interest_rate: '10',
      maximum_loan_amount: '100000',
      minimum_shares: '10',
      meeting_attendance_fine: '200',
    },
    membership: {
      minimum_age: '18',
      maximum_members: '500',
      require_guarantor: true,
      grace_period_days: '30',
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();

      if (data.success && data.data) {
        const settingsData = data.data;
        setSettings({
          organization: {
            name: settingsData.organization?.name || '',
            registration_number: settingsData.organization?.registration_number || '',
            email: settingsData.organization?.email || '',
            phone: settingsData.organization?.phone || '',
            address: settingsData.organization?.address || '',
          },
          financial: {
            share_value: settingsData.financial?.share_value || '100',
            registration_fee: settingsData.financial?.registration_fee || '1000',
            annual_fee: settingsData.financial?.annual_fee || '500',
            loan_interest_rate: settingsData.financial?.loan_interest_rate || '10',
            maximum_loan_amount: settingsData.financial?.maximum_loan_amount || '100000',
            minimum_shares: settingsData.financial?.minimum_shares || '10',
            meeting_attendance_fine: settingsData.financial?.meeting_attendance_fine || '200',
          },
          membership: {
            minimum_age: settingsData.membership?.minimum_age || '18',
            maximum_members: settingsData.membership?.maximum_members || '500',
            require_guarantor: settingsData.membership?.require_guarantor ?? true,
            grace_period_days: settingsData.membership?.grace_period_days || '30',
          },
        });
      }
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganization = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'organization',
          settings: settings.organization,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Organization settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFinancial = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'financial',
          settings: settings.financial,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Financial settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMembership = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'membership',
          settings: settings.membership,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Membership settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Fetch database reset information
  const fetchDatabaseResetInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/database-reset');
      const data = await res.json();
      if (data.success) {
        setDataStats(data.data.database_stats);
        setSystemState(data.data.system_state);
        setResetLevels(data.data.reset_levels);
      }
    } catch {
      console.error('Failed to fetch database reset info');
    }
  }, []);

  // Fetch impact summary for selected level
  const fetchImpactSummary = useCallback(async (level: string) => {
    try {
      const res = await fetch(`/api/settings/database-reset?level=${level}`);
      const data = await res.json();
      if (data.success) {
        setImpactSummary(data.data.impact_summary);
        setSelectedLevel(data.data.selected_level);
      }
    } catch {
      console.error('Failed to fetch impact summary');
    }
  }, []);

  // Open database reset wizard
  const handleOpenResetWizard = () => {
    fetchDatabaseResetInfo();
    setShowResetWizard(true);
    setResetStep('select_level');
    setSelectedLevel(null);
    setConfirmationPhrase('');
    setBackupVerified(false);
    setPasswordVerified(false);
    setCountdown(10);
    setResetProgress(null);
    setResetResult(null);
  };

  // Proceed to review step
  const handleProceedToReview = (level: ResetLevel) => {
    setSelectedLevel(level);
    fetchImpactSummary(level.id);
    setResetStep('review_impact');
  };

  // Proceed to security verification
  const handleProceedToSecurity = () => {
    setResetStep('security_verify');
  };

  // Proceed to backup confirmation
  const handleProceedToBackup = () => {
    if (selectedLevel?.id === 'level_3_organization' && !passwordVerified) {
      setError('Password verification is required for Organization Reset');
      return;
    }
    setResetStep('backup_confirm');
  };

  // Start countdown
  const handleStartCountdown = () => {
    if (!backupVerified) {
      setError('You must confirm that a backup has been created');
      return;
    }
    if (confirmationPhrase !== 'RESET YUNITE DATABASE') {
      setError('Please type "RESET YUNITE DATABASE" exactly to continue');
      return;
    }
    setResetStep('countdown');
    setCountdown(10);
  };

  // Countdown effect
  useEffect(() => {
    if (resetStep === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resetStep === 'countdown' && countdown === 0) {
      handleExecuteReset();
    }
  }, [resetStep, countdown]);

  // Execute database reset
  const handleExecuteReset = async () => {
    setResetting(true);
    setResetStep('executing');
    setResetProgress({
      phase: 'Initiating',
      progress: 0,
      totalPhases: 7,
      currentPhase: 0,
      details: 'Preparing database reset...',
    });

    try {
      const res = await fetch('/api/settings/database-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel?.id,
          user_id: userId,
          confirmation_phrase: confirmationPhrase,
          backup_verified: backupVerified,
          archive_instead_of_delete: archiveInsteadOfDelete,
          delete_audit_logs: deleteAuditLogs,
          password_verified: passwordVerified,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResetResult(data.data);
        setResetStep('complete');
      } else {
        setError(data.error || 'Database reset failed');
        setResetStep('failed');
      }
    } catch {
      setError('Database reset failed');
      setResetStep('failed');
    } finally {
      setResetting(false);
    }
  };

  // Close wizard and refresh
  const handleCloseWizard = () => {
    setShowResetWizard(false);
    fetchDatabaseResetInfo();
    if (resetResult?.status === 'completed') {
      setSuccess('Database reset completed successfully! All financial records have been reset.');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-96 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure organization and system settings</p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('organization')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'organization'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🏢 Organization
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'financial'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            💰 Financial
          </button>
          <button
            onClick={() => setActiveTab('membership')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'membership'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 Membership
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'system'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⚙️ System
          </button>
        </div>
      </div>

      {/* Organization Settings */}
      {activeTab === 'organization' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Organization Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                value={settings.organization.name}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    organization: { ...prev.organization, name: e.target.value },
                  }))
                }
                placeholder="YUNITE CBO"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Registration Number
              </label>
              <input
                type="text"
                value={settings.organization.registration_number}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    organization: { ...prev.organization, registration_number: e.target.value },
                  }))
                }
                placeholder="CBO/R/12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={settings.organization.email}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    organization: { ...prev.organization, email: e.target.value },
                  }))
                }
                placeholder="info@example.org"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.organization.phone}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    organization: { ...prev.organization, phone: e.target.value },
                  }))
                }
                placeholder="+254 700 000 000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Physical Address
              </label>
              <textarea
                value={settings.organization.address}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    organization: { ...prev.organization, address: e.target.value },
                  }))
                }
                placeholder="Organization address..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex justify-end">
            <button
              onClick={handleSaveOrganization}
              disabled={saving || !settings.organization.name}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Organization Settings
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Financial Settings */}
      {activeTab === 'financial' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Financial Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Share Value (KES per share) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={settings.financial.share_value}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, share_value: e.target.value },
                    }))
                  }
                  placeholder="100"
                  min="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Registration Fee (KES) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={settings.financial.registration_fee}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, registration_fee: e.target.value },
                    }))
                  }
                  placeholder="1000"
                  min="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Fee (KES) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={settings.financial.annual_fee}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, annual_fee: e.target.value },
                    }))
                  }
                  placeholder="500"
                  min="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loan Interest Rate (%) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={settings.financial.loan_interest_rate}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, loan_interest_rate: e.target.value },
                    }))
                  }
                  placeholder="10"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Loan Amount (KES)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={settings.financial.maximum_loan_amount}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, maximum_loan_amount: e.target.value },
                    }))
                  }
                  placeholder="100000"
                  min="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Shares Required
              </label>
              <input
                type="number"
                value={settings.financial.minimum_shares}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    financial: { ...prev.financial, minimum_shares: e.target.value },
                  }))
                }
                placeholder="10"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Attendance Fine (KES)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={settings.financial.meeting_attendance_fine}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      financial: { ...prev.financial, meeting_attendance_fine: e.target.value },
                    }))
                  }
                  placeholder="200"
                  min="0"
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex justify-end">
            <button
              onClick={handleSaveFinancial}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Financial Settings
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Membership Settings */}
      {activeTab === 'membership' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Membership Rules</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Age (years) *
              </label>
              <input
                type="number"
                value={settings.membership.minimum_age}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    membership: { ...prev.membership, minimum_age: e.target.value },
                  }))
                }
                placeholder="18"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Members
              </label>
              <input
                type="number"
                value={settings.membership.maximum_members}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    membership: { ...prev.membership, maximum_members: e.target.value },
                  }))
                }
                placeholder="500"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grace Period (days)
              </label>
              <input
                type="number"
                value={settings.membership.grace_period_days}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    membership: { ...prev.membership, grace_period_days: e.target.value },
                  }))
                }
                placeholder="30"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.membership.require_guarantor}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      membership: { ...prev.membership, require_guarantor: e.target.checked },
                    }))
                  }
                  className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Require guarantor for loan applications
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t flex justify-end">
            <button
              onClick={handleSaveMembership}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Membership Settings
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* System Settings */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          {/* Database Reset & Initialization Card */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🗄️</span>
                Database Reset & Initialization
              </h2>
              <p className="text-red-100 text-sm mt-1">
                Return the organization to a fresh operational state while preserving configuration
              </p>
            </div>
            
            <div className="p-6">
              {/* Current System State */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Current Financial State</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Savings</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState ? `KES ${systemState.savings_balance.toLocaleString()}` : '...'}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Contributions</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState ? `KES ${systemState.contributions_balance.toLocaleString()}` : '...'}
                    </p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Loans</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState ? `KES ${systemState.loans_balance.toLocaleString()}` : '...'}
                    </p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Fines</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState ? `KES ${systemState.fines_balance.toLocaleString()}` : '...'}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Welfare</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState ? `KES ${systemState.welfare_balance.toLocaleString()}` : '...'}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Accounts</p>
                    <p className="text-lg font-bold text-gray-900">
                      {systemState?.accounts_count ?? '...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reset Levels */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Available Reset Options</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Level 1 - Financial Reset */}
                  <button
                    onClick={() => handleOpenResetWizard()}
                    className="text-left border-2 border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💰</span>
                      <h4 className="font-semibold text-gray-900">Level 1: Financial Reset</h4>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Resets all financial transactions. Members and core structure remain intact.
                    </p>
                    <div className="text-xs text-gray-500">
                      <p className="font-medium text-red-600">Deletes:</p>
                      <p>Transactions, Loans, Fines, Campaigns, Accounts</p>
                    </div>
                  </button>

                  {/* Level 2 - Operational Reset */}
                  <button
                    onClick={() => handleOpenResetWizard()}
                    className="text-left border-2 border-gray-200 rounded-xl p-4 hover:border-orange-500 hover:bg-orange-50 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">⚙️</span>
                      <h4 className="font-semibold text-gray-900">Level 2: Operational Reset</h4>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Resets all financial and operational records. Members and users remain.
                    </p>
                    <div className="text-xs text-gray-500">
                      <p className="font-medium text-red-600">Deletes:</p>
                      <p>+ Meetings, Documents, Notifications, Reports</p>
                    </div>
                  </button>

                  {/* Level 3 - Organization Reset */}
                  <button
                    onClick={() => handleOpenResetWizard()}
                    className="text-left border-2 border-gray-200 rounded-xl p-4 hover:border-red-500 hover:bg-red-50 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🏢</span>
                      <h4 className="font-semibold text-gray-900">Level 3: Full Reset</h4>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Complete system reset. Only Settings, Roles, and Permissions remain.
                    </p>
                    <div className="text-xs text-gray-500">
                      <p className="font-medium text-red-600">Deletes:</p>
                      <p>+ Members, Users (except Super Admin)</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Start Button */}
              <div className="border-t pt-6">
                <button
                  onClick={handleOpenResetWizard}
                  className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-xl hover:from-red-700 hover:to-red-800 transition-all flex items-center justify-center gap-2"
                >
                  <span>🔄</span>
                  Open Database Reset Wizard
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Multi-step process with safety confirmations and backup verification
                </p>
              </div>
            </div>
          </div>

          {/* System Information Card */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">System Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Version</span>
                <p className="font-medium text-gray-900">YUNITE Enterprise OS v1.0.0</p>
              </div>
              <div>
                <span className="text-gray-500">Database</span>
                <p className="font-medium text-gray-900">PostgreSQL (Supabase)</p>
              </div>
              <div>
                <span className="text-gray-500">Last Updated</span>
                <p className="font-medium text-gray-900">{new Date().toLocaleDateString('en-KE')}</p>
              </div>
              <div>
                <span className="text-gray-500">Total Records</span>
                <p className="font-medium text-gray-900">
                  {dataStats 
                    ? Object.values(dataStats.will_be_deleted).reduce((a, b) => a + (b || 0), 0) + (dataStats.will_be_preserved.members || 0)
                    : '...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database Reset Wizard Modal */}
      {showResetWizard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Wizard Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">🔄 Database Reset & Initialization</h2>
                  <p className="text-red-100 text-sm">Enterprise-grade data reset with safety protections</p>
                </div>
                {resetStep !== 'executing' && (
                  <button
                    onClick={handleCloseWizard}
                    className="text-white/80 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                )}
              </div>
              
              {/* Progress Steps */}
              {resetStep !== 'executing' && resetStep !== 'complete' && resetStep !== 'failed' && (
                <div className="flex items-center gap-2 mt-4">
                  {['Select', 'Review', 'Security', 'Backup', 'Execute'].map((step, idx) => {
                    const steps = ['select_level', 'review_impact', 'security_verify', 'backup_confirm', 'countdown'];
                    const currentIdx = steps.indexOf(resetStep);
                    const isActive = idx === currentIdx;
                    const isComplete = idx < currentIdx;
                    
                    return (
                      <div key={step} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          isComplete ? 'bg-green-500 text-white' : 
                          isActive ? 'bg-white text-red-600' : 
                          'bg-red-400 text-white/60'
                        }`}>
                          {isComplete ? '✓' : idx + 1}
                        </div>
                        {idx < 4 && (
                          <div className={`w-8 h-0.5 ${isComplete ? 'bg-green-500' : 'bg-red-400/40'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Wizard Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step 1: Select Level */}
              {resetStep === 'select_level' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Reset Level</h3>
                  <p className="text-gray-600 mb-6">
                    Choose the appropriate reset level for your needs. Each level has different implications.
                  </p>
                  
                  <div className="space-y-4">
                    {resetLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => handleProceedToReview(level)}
                        className={`w-full text-left border-2 rounded-xl p-4 transition-all ${
                          selectedLevel?.id === level.id 
                            ? 'border-red-500 bg-red-50' 
                            : 'border-gray-200 hover:border-red-300'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                            level.id === 'level_1_financial' ? 'bg-blue-100' :
                            level.id === 'level_2_operational' ? 'bg-orange-100' :
                            'bg-red-100'
                          }`}>
                            {level.id === 'level_1_financial' ? '💰' :
                             level.id === 'level_2_operational' ? '⚙️' : '🏢'}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{level.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{level.description}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                Deletes: {level.affected_tables.length} tables
                              </span>
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                Preserves: {level.preserved_tables.length} tables
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Review Impact */}
              {resetStep === 'review_impact' && selectedLevel && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Review: {selectedLevel.name}
                  </h3>
                  <p className="text-gray-600 mb-6">{selectedLevel.description}</p>
                  
                  {/* Impact Summary */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <h4 className="font-semibold text-red-900 mb-3">⚠️ Records That Will Be Deleted</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {impactSummary?.will_be_deleted?.map((item: any) => (
                        <div key={item.table} className="bg-white rounded-lg p-3">
                          <p className="text-2xl font-bold text-gray-900">{item.count.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 capitalize">{item.table.replace('_', ' ')}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm text-red-800 font-medium">
                      Total: {impactSummary?.total_records_affected?.toLocaleString() || 0} records will be affected
                    </p>
                  </div>

                  {/* Preserved */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                    <h4 className="font-semibold text-green-900 mb-3">✅ Records That Will Be Preserved</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedLevel.preserved_tables.map((table) => (
                        <span key={table} className="bg-white px-3 py-1 rounded-full text-sm text-gray-700 capitalize border">
                          {table.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between">
                    <button
                      onClick={() => setResetStep('select_level')}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleProceedToSecurity}
                      className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      I Understand, Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Security Verification */}
              {resetStep === 'security_verify' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Security Verification</h3>
                  <p className="text-gray-600 mb-6">
                    {selectedLevel?.id === 'level_3_organization' 
                      ? 'Organization Reset requires password verification.'
                      : 'Super Admin authentication required.'}
                  </p>

                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">🔐</span>
                        <span className="font-semibold text-yellow-900">Super Admin Verification</span>
                      </div>
                      <p className="text-sm text-yellow-800">
                        Only users with Super Admin role can perform database reset operations.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Super Admin Password
                      </label>
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        For demo purposes, password verification is simulated
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="simulateVerify"
                        checked={passwordVerified}
                        onChange={(e) => setPasswordVerified(e.target.checked)}
                        className="w-4 h-4 text-red-600"
                      />
                      <label htmlFor="simulateVerify" className="text-sm text-gray-700">
                        I confirm I am a Super Administrator
                      </label>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <button
                      onClick={() => setResetStep('review_impact')}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleProceedToBackup}
                      className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Backup Confirmation */}
              {resetStep === 'backup_confirm' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Backup & Final Confirmation</h3>
                  <p className="text-gray-600 mb-6">
                    Before proceeding, ensure you have created a backup of your data.
                  </p>

                  <div className="space-y-4">
                    {/* Archive Option */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="archiveOption"
                            checked={archiveInsteadOfDelete}
                            onChange={(e) => setArchiveInsteadOfDelete(e.target.checked)}
                            className="w-5 h-5 text-blue-600"
                          />
                          <div>
                            <label htmlFor="archiveOption" className="font-semibold text-blue-900">
                              Archive Before Delete (Recommended)
                            </label>
                            <p className="text-sm text-blue-700">
                              Create a backup archive before deleting records
                            </p>
                          </div>
                        </div>
                        <span className="text-2xl">📦</span>
                      </div>
                    </div>

                    {/* Backup Verification */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          id="backupVerified"
                          checked={backupVerified}
                          onChange={(e) => setBackupVerified(e.target.checked)}
                          className="w-5 h-5 text-red-600"
                        />
                        <label htmlFor="backupVerified" className="font-semibold text-yellow-900">
                          I have created a database backup
                        </label>
                      </div>
                      <p className="text-sm text-yellow-800">
                        ⚠️ This action cannot be undone. A backup is essential for data recovery.
                      </p>
                    </div>

                    {/* Audit Logs Option */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="deleteAuditLogs"
                          checked={deleteAuditLogs}
                          onChange={(e) => setDeleteAuditLogs(e.target.checked)}
                          className="w-4 h-4 text-gray-600"
                        />
                        <div>
                          <label htmlFor="deleteAuditLogs" className="font-medium text-gray-900">
                            Also delete audit logs
                          </label>
                          <p className="text-sm text-gray-500">
                            Not recommended - audit logs provide administrative history
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Confirmation Phrase */}
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                      <label className="block text-sm font-bold text-red-900 mb-2">
                        Type exactly: <span className="font-mono text-lg">RESET YUNITE DATABASE</span>
                      </label>
                      <input
                        type="text"
                        value={confirmationPhrase}
                        onChange={(e) => setConfirmationPhrase(e.target.value)}
                        placeholder="RESET YUNITE DATABASE"
                        className={`w-full px-4 py-2 border-2 rounded-lg font-mono text-lg ${
                          confirmationPhrase === 'RESET YUNITE DATABASE' 
                            ? 'border-green-500 bg-green-50' 
                            : 'border-red-300'
                        }`}
                      />
                      {confirmationPhrase && confirmationPhrase !== 'RESET YUNITE DATABASE' && (
                        <p className="text-red-600 text-sm mt-1">Must match exactly</p>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <button
                      onClick={() => setResetStep('security_verify')}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleStartCountdown}
                      disabled={!backupVerified || confirmationPhrase !== 'RESET YUNITE DATABASE'}
                      className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Proceed to Countdown →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Countdown */}
              {resetStep === 'countdown' && (
                <div className="text-center py-8">
                  <div className="text-8xl font-bold text-red-600 mb-4">{countdown}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Reset Initiating...
                  </h3>
                  <p className="text-gray-600">
                    Database reset will begin automatically when countdown reaches zero.
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    Press any button or close this dialog to cancel
                  </p>
                  <button
                    onClick={() => setResetStep('backup_confirm')}
                    className="mt-6 px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Step 6: Executing */}
              {resetStep === 'executing' && (
                <div className="py-8">
                  <div className="text-center mb-8">
                    <div className="animate-spin text-6xl mb-4">⚙️</div>
                    <h3 className="text-xl font-semibold text-gray-900">Executing Database Reset</h3>
                    <p className="text-gray-600">Please wait while the reset operation completes...</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="bg-gray-100 rounded-full h-4 overflow-hidden mb-4">
                    <div 
                      className="bg-gradient-to-r from-red-500 to-red-600 h-full transition-all duration-500"
                      style={{ width: `${resetProgress?.progress || 0}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        {resetProgress?.phase || 'Preparing...'}
                      </span>
                      <span className="text-sm text-gray-500">
                        {resetProgress?.progress?.toFixed(0) || 0}%
                      </span>
                    </div>
                    {resetProgress?.details && (
                      <p className="text-xs text-gray-500">{resetProgress.details}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 7: Complete */}
              {resetStep === 'complete' && resetResult && (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-xl font-semibold text-green-900 mb-2">
                    Database Reset Complete!
                  </h3>
                  <p className="text-gray-600 mb-6">
                    The system has been successfully reinitialized.
                  </p>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left mb-6">
                    <h4 className="font-semibold text-green-900 mb-2">Reset Report</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Status:</div>
                      <div className="font-medium text-green-700">{resetResult.status}</div>
                      <div>Reset Level:</div>
                      <div className="font-medium">{resetResult.reset_level?.replace('_', ' ')}</div>
                      <div>Validation:</div>
                      <div className={`font-medium ${resetResult.validation_passed ? 'text-green-700' : 'text-red-700'}`}>
                        {resetResult.validation_passed ? 'PASSED ✓' : 'FAILED ✗'}
                      </div>
                      {resetResult.archived && (
                        <>
                          <div>Archive ID:</div>
                          <div className="font-mono text-xs">{resetResult.archive_id}</div>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleCloseWizard}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Close & Refresh
                  </button>
                </div>
              )}

              {/* Step 8: Failed */}
              {resetStep === 'failed' && (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">❌</div>
                  <h3 className="text-xl font-semibold text-red-900 mb-2">
                    Reset Failed
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {error || 'An error occurred during the reset process.'}
                  </p>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left mb-6">
                    <h4 className="font-semibold text-red-900 mb-2">Troubleshooting</h4>
                    <ul className="text-sm text-red-700 space-y-1">
                      <li>• Check database connectivity</li>
                      <li>• Verify user permissions</li>
                      <li>• Ensure no active transactions</li>
                      <li>• Contact system administrator</li>
                    </ul>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={handleCloseWizard}
                      className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setResetStep('select_level');
                        setError(null);
                      }}
                      className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="mt-8 bg-gray-50 rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Version</span>
            <p className="font-medium text-gray-900">YUNITE Enterprise OS v1.0.0</p>
          </div>
          <div>
            <span className="text-gray-500">Database</span>
            <p className="font-medium text-gray-900">PostgreSQL (Supabase)</p>
          </div>
          <div>
            <span className="text-gray-500">Last Updated</span>
            <p className="font-medium text-gray-900">{new Date().toLocaleDateString('en-KE')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
