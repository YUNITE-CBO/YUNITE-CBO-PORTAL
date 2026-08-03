'use client';

import { useEffect, useState } from 'react';

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
  };
  will_be_preserved: {
    members: number;
  };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'organization' | 'financial' | 'membership' | 'system'>('organization');
  
  // Reset data state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
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

  // Fetch data statistics for reset
  const fetchDataStats = async () => {
    try {
      const res = await fetch('/api/settings/reset-data');
      const data = await res.json();
      if (data.success) {
        setDataStats(data.data);
      }
    } catch {
      console.error('Failed to fetch data stats');
    }
  };

  // Open reset modal
  const handleOpenResetModal = () => {
    fetchDataStats();
    setShowResetModal(true);
    setResetConfirmText('');
  };

  // Handle data reset
  const handleResetData = async () => {
    if (resetConfirmText !== 'RESET ALL DATA') {
      setError('Please type "RESET ALL DATA" to confirm');
      return;
    }

    setResetting(true);
    setError(null);

    try {
      const res = await fetch('/api/settings/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm_reset: true,
          user_id: '00000000-0000-0000-0000-000000000000',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('All financial data has been reset successfully!');
        setShowResetModal(false);
        fetchDataStats(); // Refresh stats
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(data.error || 'Failed to reset data');
      }
    } catch {
      setError('Failed to reset data');
    } finally {
      setResetting(false);
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

      {/* System Settings - Reset Data */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">System Operations</h2>
          
          {/* Data Statistics */}
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Current Data Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.transactions || '...'}
                </p>
                <p className="text-xs text-gray-500">Transactions</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.loans || '...'}
                </p>
                <p className="text-xs text-gray-500">Loans</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.fines || '...'}
                </p>
                <p className="text-xs text-gray-500">Fines</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.accounts || '...'}
                </p>
                <p className="text-xs text-gray-500">Accounts</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_preserved.members || '...'}
                </p>
                <p className="text-xs text-gray-500">Members (Preserved)</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.campaigns || '...'}
                </p>
                <p className="text-xs text-gray-500">Campaigns</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.documents || '...'}
                </p>
                <p className="text-xs text-gray-500">Documents</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900">
                  {dataStats?.will_be_deleted.compliance_records || '...'}
                </p>
                <p className="text-xs text-gray-500">Compliance Records</p>
              </div>
            </div>
          </div>

          {/* Reset Data Section */}
          <div className="border-t pt-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="text-4xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-900">Danger Zone - Reset All Financial Data</h3>
                  <p className="mt-2 text-sm text-red-700">
                    This action will permanently delete all financial records including transactions, loans, fines, 
                    contributions, and accounts. <strong>Members will be preserved</strong> but their financial 
                    balances will be reset to zero.
                  </p>
                  <p className="mt-2 text-sm text-red-700">
                    <strong>This action cannot be undone!</strong> Make sure to backup your data before proceeding.
                  </p>
                  
                  <button
                    onClick={handleOpenResetModal}
                    className="mt-4 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <span>🗑️</span>
                    Reset All Financial Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Data Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>⚠️</span>
                Confirm Data Reset
              </h3>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                You are about to reset all financial data. This will delete:
              </p>
              <ul className="text-sm text-gray-700 space-y-1 mb-4">
                <li>• {dataStats?.will_be_deleted.transactions || 0} transactions</li>
                <li>• {dataStats?.will_be_deleted.loans || 0} loans</li>
                <li>• {dataStats?.will_be_deleted.fines || 0} fines</li>
                <li>• {dataStats?.will_be_deleted.accounts || 0} member accounts</li>
                <li>• {dataStats?.will_be_deleted.campaigns || 0} campaigns</li>
                <li>• {dataStats?.will_be_deleted.documents || 0} documents</li>
                <li>• {dataStats?.will_be_deleted.compliance_records || 0} compliance records</li>
              </ul>
              <p className="text-sm text-gray-600 mb-4">
                <strong>{dataStats?.will_be_preserved.members || 0} members</strong> will be preserved.
              </p>
              
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <span className="font-bold text-red-600">RESET ALL DATA</span> to confirm:
                </label>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="RESET ALL DATA"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                />
              </div>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                  setError(null);
                }}
                disabled={resetting}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                disabled={resetting || resetConfirmText !== 'RESET ALL DATA'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {resetting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Resetting...
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    Reset Data
                  </>
                )}
              </button>
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
