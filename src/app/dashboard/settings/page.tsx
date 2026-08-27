'use client';

/**
 * Enhanced Settings Page - Phase 4
 * Configuration Management Framework
 * 
 * Every setting always loads from the database.
 * No placeholder text when values exist.
 * Configuration status indicators for each section.
 * Includes System Administration with Database Reset functionality.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import ApiSettingsSection from '@/components/settings/ApiSettingsSection';
import WorkflowsSettingsSection from '@/components/settings/WorkflowsSettingsSection';
import AiSettingsSection from '@/components/settings/AiSettingsSection';
import { MediaSettingsSection } from '@/components/settings/MediaSettingsSection';
import RegistrationSettingsSection from '@/components/settings/RegistrationSettingsSection';
import TransactionsSettingsSection from '@/components/settings/TransactionsSettingsSection';
import { YuniteImageUploader } from '@/components/media/YuniteImageUploader';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  data_type: string;
  is_encrypted: boolean;
  is_public: boolean;
  is_required?: boolean;
  display_order: number;
  help_text: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface ConfigurationCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  settings: Setting[];
  configuration_status: 'configured' | 'partial' | 'unconfigured';
  configured_count: number;
  total_count: number;
}

interface ConfigurationHistory {
  id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

interface ConfigurationStatus {
  total_categories: number;
  configured_categories: number;
  partial_categories: number;
  unconfigured_categories: number;
  total_settings: number;
  configured_settings: number;
}

interface DataStats {
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

type ActiveSection = 'overview' | 'organization' | 'financial' | 'loan' | 'savings' | 'security' | 'smtp' | 'notifications' | 'welfare' | 'contributions' | 'compliance' | 'branding' | 'integrations' | 'system' | 'membership' | 'workflow' | 'history' | 'api' | 'ai' | 'media' | 'registration' | 'transactions' | 'unity_fund';

export default function EnhancedSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  
  // Current user state
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  // Configuration data
  const [categories, setCategories] = useState<ConfigurationCategory[]>([]);
  const [status, setStatus] = useState<ConfigurationStatus | null>(null);
  const [history, setHistory] = useState<ConfigurationHistory[]>([]);
  
  // Edit mode
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  // Database Reset state
  const [showResetWizard, setShowResetWizard] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('select_level');
  const [selectedLevel, setSelectedLevel] = useState<ResetLevel | null>(null);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [impactSummary, setImpactSummary] = useState<any>(null);
  
  // Reset form state
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [backupVerified, setBackupVerified] = useState(false);
  const [archiveInsteadOfDelete, setArchiveInsteadOfDelete] = useState(true);
  const [deleteAuditLogs, setDeleteAuditLogs] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [countdown, setCountdown] = useState(10);
  const [resetProgress, setResetProgress] = useState<ResetProgress | null>(null);
  const [resetResult, setResetResult] = useState<any>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // SMTP Test state
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{success: boolean; message: string; error?: string} | null>(null);

  useEffect(() => {
    fetchSession();
    fetchConfiguration();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.success && data.data) {
        setCurrentUser(data.data.user);
        setIsAdmin(['super_admin', 'admin'].includes(data.data.user.role));
        setIsSuperAdmin(data.data.user.role === 'super_admin');
      }
    } catch (err) {
      console.error('Failed to fetch session:', err);
    }
  };

  const fetchDatabaseResetInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/database-reset');
      const data = await res.json();
      if (data.success) {
        setDataStats(data.data.database_stats ?? data.data.stats);
        setSystemState(data.data.system_state ?? data.data.systemState);
      }
    } catch (err) {
      console.error('Failed to fetch database reset info:', err);
    }
  }, []);

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      
      // Fetch all categories with settings
      const [configRes, statusRes, historyRes] = await Promise.all([
        fetch('/api/configuration'),
        fetch('/api/configuration?status=true'),
        fetch('/api/configuration?history=true&limit=20')
      ]);

      const [configData, statusData, historyData] = await Promise.all([
        configRes.json(),
        statusRes.json(),
        historyRes.json()
      ]);

      if (configData.success) {
        setCategories(configData.data);
        
        // Initialize edited values with current DB values
        const initialEdits: Record<string, string> = {};
        for (const cat of configData.data) {
          for (const setting of cat.settings) {
            initialEdits[setting.key] = setting.value || '';
          }
        }
        setEditedSettings(initialEdits);
      }

      if (statusData.success) {
        setStatus(statusData.data);
      }

      if (historyData.success) {
        setHistory(historyData.data.history);
      }
    } catch (err) {
      console.error('Failed to fetch configuration:', err);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  // Reset level configurations
  const resetLevels: ResetLevel[] = [
    {
      id: 'level_1_financial',
      name: 'Financial Reset',
      description: 'Resets all financial transactions and balances. Members and core structure remain intact.',
      affected_tables: ['transactions', 'loans', 'fines', 'campaigns', 'accounts'],
      preserved_tables: ['members', 'users', 'settings', 'documents'],
    },
    {
      id: 'level_2_operational',
      name: 'Operational Reset',
      description: 'Resets all financial and operational records. Members and users remain.',
      affected_tables: ['transactions', 'loans', 'fines', 'campaigns', 'accounts', 'documents', 'compliance_records'],
      preserved_tables: ['members', 'users', 'settings', 'audit_logs'],
    },
    {
      id: 'level_3_organization',
      name: 'Organization Reset',
      description: 'Complete system reset. Only Settings, Roles, and Permissions remain.',
      affected_tables: ['transactions', 'loans', 'fines', 'campaigns', 'accounts', 'documents', 'compliance_records', 'members', 'users'],
      preserved_tables: ['settings', 'roles', 'permissions', 'audit_logs'],
    },
  ];

  const handleOpenResetWizard = (level?: ResetLevel) => {
    setShowResetWizard(true);
    setResetStep('select_level');
    if (level) {
      setSelectedLevel(level);
    }
    fetchDatabaseResetInfo();
  };

  const handleProceedToSecurity = async () => {
    if (!selectedLevel) return;
    
    setResetStep('security_verify');
  };

  const handleProceedToBackup = async () => {
    if (selectedLevel?.id === 'level_3_organization' && !resetPassword) {
      setError('Enter your account password to authorize an Organization Reset');
      return;
    }

    setResetStep('backup_confirm');
  };

  const handleStartCountdown = async () => {
    if (!backupVerified || confirmationPhrase !== 'RESET YUNITE DATABASE') {
      setError('Please complete all verification steps');
      return;
    }
    
    setResetStep('countdown');
    setCountdown(10);
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          executeReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const executeReset = async () => {
    if (!selectedLevel) return;
    
    setResetStep('executing');
    setResetProgress({ phase: 'Preparing...', progress: 0, totalPhases: 5, currentPhase: 0 });
    
    try {
      const res = await fetch('/api/settings/database-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel.id,
          confirmation_phrase: confirmationPhrase,
          backup_verified: backupVerified,
          archive_instead_of_delete: archiveInsteadOfDelete,
          delete_audit_logs: deleteAuditLogs,
          // Sent only for level_3_organization; verified server-side
          // against the caller's own password hash. Never stored.
          password: resetPassword || undefined,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setResetProgress({ phase: 'Complete', progress: 100, totalPhases: 5, currentPhase: 5 });
        setResetResult(data.data);
        setResetStep('complete');
      } else {
        setResetStep('failed');
        setError(data.error || 'Reset failed');
      }
    } catch (err) {
      setResetStep('failed');
      setError('Failed to execute database reset');
    }
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
  };

  const handleCloseWizard = () => {
    setShowResetWizard(false);
    setResetStep('select_level');
    setSelectedLevel(null);
    setConfirmationPhrase('');
    setBackupVerified(false);
    setResetPassword('');
    setError(null);
    fetchDatabaseResetInfo();
  };

  const handleSettingChange = (key: string, value: string) => {
    setEditedSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSection = async (categoryCode: string) => {
    if (!isAdmin) {
      setError('You do not have permission to modify settings');
      return;
    }

    const category = categories.find(c => c.code === categoryCode);
    if (!category) return;

    // Find changed settings
    const changes: Record<string, string> = {};
    for (const setting of category.settings) {
      if (editedSettings[setting.key] !== setting.value) {
        changes[setting.key] = editedSettings[setting.key];
      }
    }

    if (Object.keys(changes).length === 0) {
      setSuccess('No changes to save');
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: changes,
          reason: changeReason || 'Configuration update'
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`${Object.keys(changes).length} setting(s) updated successfully`);
        setChangeReason('');
        // Refresh configuration
        await fetchConfiguration();
      } else {
        // Surface the detailed per-setting errors returned by the API
        // (e.g. "smtp.host: Setting not found") instead of the generic
        // "Some settings failed to update" message.
        const detail = Array.isArray(data.details) && data.details.length > 0
          ? data.details.join('; ')
          : null;
        setError(detail ? `${data.error || 'Failed to save settings'}: ${detail}` : (data.error || 'Failed to save settings'));
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // SMTP Test Connection
  const handleTestSmtp = async () => {
    if (!isAdmin) {
      setError('You do not have permission to test SMTP');
      return;
    }

    setSmtpTesting(true);
    setSmtpTestResult(null);

    // Get current SMTP settings
    const smtpSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(editedSettings)) {
      if (key.startsWith('smtp.')) {
        smtpSettings[key.replace('smtp.', '')] = value;
      }
    }

    try {
      const res = await fetch('/api/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smtpSettings.host || 'smtp.gmail.com',
          port: smtpSettings.port || '587',
          secure: smtpSettings.secure === 'true',
          user: smtpSettings.user || '',
          password: smtpSettings.password || '',
          fromEmail: smtpSettings.from_email || '',
          fromName: smtpSettings.from_name || 'YUNITE'
        })
      });

      const data = await res.json();

      if (data.success) {
        setSmtpTestResult({
          success: true,
          message: 'SMTP connection successful! Test email sent.'
        });
      } else {
        setSmtpTestResult({
          success: false,
          message: data.error || 'SMTP test failed',
          error: data.details
        });
      }
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: 'Failed to test SMTP connection',
        error: err.message
      });
    } finally {
      setSmtpTesting(false);
    }
  };

  const getStatusBadge = (status: 'configured' | 'partial' | 'unconfigured') => {
    const badges = {
      configured: { bg: 'bg-green-100', text: 'text-green-800', label: 'Configured' },
      partial: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Partial' },
      unconfigured: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Not Set' }
    };
    const badge = badges[status];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-gray-900">{status?.total_categories || 0}</div>
          <div className="text-sm text-gray-500 mt-1">Total Categories</div>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-green-600">{status?.configured_categories || 0}</div>
          <div className="text-sm text-gray-500 mt-1">Fully Configured</div>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-yellow-600">{status?.partial_categories || 0}</div>
          <div className="text-sm text-gray-500 mt-1">Partially Configured</div>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <div className="text-3xl font-bold text-gray-400">{status?.unconfigured_categories || 0}</div>
          <div className="text-sm text-gray-500 mt-1">Not Configured</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Progress</h3>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-green-500 h-3 rounded-full transition-all duration-500"
            style={{ 
              width: `${status ? Math.round((status.configured_settings / status.total_settings) * 100) : 0}%` 
            }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {status?.configured_settings || 0} of {status?.total_settings || 0} settings configured 
          ({status ? Math.round((status.configured_settings / status.total_settings) * 100) : 0}%)
        </p>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setActiveSection(category.code as ActiveSection)}
            className="bg-white rounded-xl border p-6 text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${category.color}20` }}
              >
                <span className="text-xl" role="img" aria-label={category.name}>
                  {category.code === 'organization' && '🏢'}
                  {category.code === 'financial' && '💰'}
                  {category.code === 'loan' && '💳'}
                  {category.code === 'savings' && '🐷'}
                  {category.code === 'security' && '🔒'}
                  {category.code === 'smtp' && '📧'}
                  {category.code === 'notifications' && '🔔'}
                  {category.code === 'welfare' && '❤️'}
                  {category.code === 'contributions' && '🎁'}
                  {category.code === 'compliance' && '📋'}
                  {category.code === 'branding' && '🎨'}
                  {category.code === 'integrations' && '🔌'}
                  {category.code === 'system' && '⚙️'}
                  {category.code === 'membership' && '👥'}
                  {category.code === 'workflow' && '🔧'}
                  {category.code === 'api' && '🔑'}
                  {category.code === 'ai' && '🧠'}
                  {category.code === 'media' && '🖼️'}
                  {category.code === 'registration' && '📝'}
                  {category.code === 'transactions' && '💹'}
                  {category.code === 'unity_fund' && '🏦'}
                  {!['organization', 'financial', 'loan', 'savings', 'security', 'smtp', 'notifications', 'welfare', 'contributions', 'compliance', 'branding', 'integrations', 'system', 'membership', 'workflow', 'api', 'ai', 'media', 'registration', 'transactions', 'unity_fund'].includes(category.code) && '⚙️'}
                </span>
              </div>
              {getStatusBadge(category.configuration_status)}
            </div>
            <h4 className="font-semibold text-gray-900">{category.name}</h4>
            <p className="text-sm text-gray-500 mt-1">{category.description}</p>
            <div className="text-xs text-gray-400 mt-3">
              {category.configured_count}/{category.total_count} settings
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderSettingsForm = (category: ConfigurationCategory) => {
    const hasChanges = category.settings.some(s => editedSettings[s.key] !== s.value);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setActiveSection('overview')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{category.name}</h2>
              <p className="text-sm text-gray-500">{category.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(category.configuration_status)}
            {isAdmin && hasChanges && (
              <button
                onClick={() => handleSaveSection(category.code)}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Change Reason */}
        {hasChanges && isAdmin && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-yellow-800 mb-2">
              Reason for change (optional)
            </label>
            <input
              type="text"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Explain why you're making this change..."
              className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500"
            />
          </div>
        )}

        {/* Settings List */}
        <div className="bg-white rounded-xl border divide-y">
          {category.settings.map(setting => (
            <div key={setting.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {setting.key.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    {setting.is_required === false && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 align-middle">
                        Optional
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">{setting.help_text || setting.description}</p>
                  {setting.updated_at && (
                    <p className="text-xs text-gray-400">
                      Last updated: {formatDate(setting.updated_at)}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Current Value from DB */}
              <div className="mt-2">
                {setting.data_type === 'password' ? (
                  <div className="relative">
                    <input
                      type="password"
                      value={editedSettings[setting.key] || ''}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      disabled={!isAdmin}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      placeholder={setting.help_text || `Enter ${setting.key.split('.').pop()}`}
                    />
                    {setting.value && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        ●●●●●●●●
                      </span>
                    )}
                  </div>
                ) : setting.data_type === 'boolean' ? (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editedSettings[setting.key] === 'true'}
                      onChange={(e) => handleSettingChange(setting.key, e.target.checked ? 'true' : 'false')}
                      disabled={!isAdmin}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-600">
                      {editedSettings[setting.key] === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                ) : setting.data_type === 'color' ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(editedSettings[setting.key] || '') ? editedSettings[setting.key] : '#0B2A4A'}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      disabled={!isAdmin}
                      className="h-10 w-14 p-1 border border-gray-300 rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={editedSettings[setting.key] || ''}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      disabled={!isAdmin}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      placeholder="#0B2A4A"
                    />
                    {/^#[0-9A-Fa-f]{6}$/.test(editedSettings[setting.key] || '') && (
                      <span
                        className="h-8 w-8 rounded-lg border border-gray-200 flex-shrink-0"
                        style={{ backgroundColor: editedSettings[setting.key] }}
                      />
                    )}
                  </div>
                ) : setting.key === 'organization.logo_url' ? (
                  /* The org logo is managed by the central Media Engine uploader,
                     not a free-text URL field. Upload/replace/remove here writes
                     the active ORGANIZATION_LOGO asset and mirrors this column. */
                  <div className="space-y-3">
                    <YuniteImageUploader
                      ownerType="organization"
                      ownerId="default"
                      assetType="ORGANIZATION_LOGO"
                      label="Organization Logo"
                      fallbackName="YUNITE PAMOJA CBO"
                      variant="logo"
                      onChanged={fetchConfiguration}
                    />
                    {setting.value && (
                      <p className="text-xs text-gray-400">
                        Current URL: <span className="font-mono break-all">{setting.value}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type={setting.data_type === 'number' ? 'number' : 'text'}
                    value={editedSettings[setting.key] || ''}
                    onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                    disabled={!isAdmin}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder={setting.help_text || `Enter value`}
                  />
                )}
              </div>

              {/* Show if changed */}
              {editedSettings[setting.key] !== setting.value && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Original:</span>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                    {setting.value || '(empty)'}
                  </span>
                  <span className="text-xs text-blue-600">→</span>
                  <span className="text-xs font-mono bg-blue-50 px-2 py-1 rounded text-blue-700">
                    {editedSettings[setting.key] || '(empty)'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Configuration History</h2>
        <button
          onClick={() => setShowHistory(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ← Back to Overview
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Setting</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changed By</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {history.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No configuration changes recorded yet
                </td>
              </tr>
            ) : (
              history.map(entry => (
                <tr key={entry.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-sm text-gray-900">{entry.setting_key}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 line-through">
                        {entry.old_value || '(empty)'}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-xs text-gray-900">
                        {entry.new_value || '(empty)'}
                      </span>
                    </div>
                    {entry.reason && (
                      <p className="text-xs text-gray-400 mt-1">{entry.reason}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {entry.changed_by_name || 'System'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(entry.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSystemSection = () => (
    <div className="space-y-6">
      {/* Permission Notice */}
      {!isSuperAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-semibold text-yellow-900">Restricted Access</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Database reset functionality is only available to Super Administrators.
                {currentUser ? (
                  <> Your current role is <span className="font-medium">{currentUser.role || 'user'}</span>.</>
                ) : (
                  <> You may need to log in with a Super Administrator account.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

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
                  {systemState ? `KES ${(systemState.savings_balance || 0).toLocaleString()}` : '...'}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Contributions</p>
                <p className="text-lg font-bold text-gray-900">
                  {systemState ? `KES ${(systemState.contributions_balance || 0).toLocaleString()}` : '...'}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Loans</p>
                <p className="text-lg font-bold text-gray-900">
                  {systemState ? `KES ${(systemState.loans_balance || 0).toLocaleString()}` : '...'}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Fines</p>
                <p className="text-lg font-bold text-gray-900">
                  {systemState ? `KES ${(systemState.fines_balance || 0).toLocaleString()}` : '...'}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Welfare</p>
                <p className="text-lg font-bold text-gray-900">
                  {systemState ? `KES ${(systemState.welfare_balance || 0).toLocaleString()}` : '...'}
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

          {/* Reset Levels - Only show for Super Admins */}
          {isSuperAdmin ? (
            <>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Available Reset Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Level 1 - Financial Reset */}
                <button
                  onClick={() => handleOpenResetWizard(resetLevels[0])}
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
                  onClick={() => handleOpenResetWizard(resetLevels[1])}
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
                  onClick={() => handleOpenResetWizard(resetLevels[2])}
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
                onClick={() => handleOpenResetWizard()}
                className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-xl hover:from-red-700 hover:to-red-800 transition-all flex items-center justify-center gap-2"
              >
                <span>🔄</span>
                Open Reset Wizard
              </button>
            </div>
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
              <p className="text-gray-600">
                Only Super Administrators can perform database reset operations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className="bg-gray-50 rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Version</span>
            <p className="font-medium text-gray-900">YUNITE Enterprise OS v1.1.0</p>
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

      {/* Reset Wizard Modal */}
      {showResetWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Wizard Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedLevel ? `${selectedLevel.name} Wizard` : 'Database Reset Wizard'}
                </h2>
                <button
                  onClick={handleCloseWizard}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Step 1: Select Level */}
              {resetStep === 'select_level' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Reset Level</h3>
                  <div className="space-y-3">
                    {resetLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setSelectedLevel(level)}
                        className={`w-full text-left border-2 rounded-xl p-4 transition-all ${
                          selectedLevel?.id === level.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900">{level.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{level.description}</p>
                          </div>
                          {selectedLevel?.id === level.id && (
                            <span className="text-2xl text-blue-500">✓</span>
                          )}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                            Deletes: {level.affected_tables.length} tables
                          </span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            Preserves: {level.preserved_tables.length} tables
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end mt-6">
                    <button
                      onClick={handleProceedToSecurity}
                      disabled={!selectedLevel}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Security Verification */}
              {resetStep === 'security_verify' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Security Verification</h3>
                  <p className="text-gray-600 mb-6">
                    Super Admin authentication required.
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

                    {selectedLevel?.id === 'level_3_organization' ? (
                      <div>
                        <label htmlFor="resetPassword" className="block text-sm font-medium text-gray-700 mb-1">
                          Your account password <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="password"
                          id="resetPassword"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="Enter your password to authorize this reset"
                          autoComplete="current-password"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Organization Reset is irreversible — it is verified server-side against your own account credentials.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-green-600">✓</span>
                        Your Super Administrator session authorizes this reset level.
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <button
                      onClick={() => setResetStep('select_level')}
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

              {/* Step 3: Backup Confirmation */}
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

              {/* Step 4: Countdown */}
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

              {/* Step 5: Executing */}
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

              {/* Step 6: Complete */}
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

              {/* Step 7: Failed */}
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
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const currentCategory = categories.find(c => c.code === activeSection);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">System Configuration</h1>
        <p className="text-gray-600 mt-1">
          Configure your organization&apos;s settings. All values are loaded directly from the database.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg break-words">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Navigation Tabs */}
      {activeSection === 'overview' && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            View History
          </button>
        </div>
      )}

      {/* Content */}
      {showHistory ? (
        renderHistory()
      ) : activeSection === 'overview' ? (
        renderOverview()
      ) : activeSection === 'api' ? (
        isSuperAdmin ? (
          <ApiSettingsSection onBack={() => setActiveSection('overview')} />
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <h3 className="font-semibold text-yellow-900">Restricted Access</h3>
                <p className="text-sm text-yellow-800 mt-1">
                  API Keys &amp; Gateway management is only available to Super Administrators.
                  {currentUser ? (
                    <> Your current role is <span className="font-medium">{currentUser.role || 'user'}</span>.</>
                  ) : (
                    <> You may need to log in with a Super Administrator account.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )
      ) : activeSection === 'workflow' ? (
        <WorkflowsSettingsSection onBack={() => setActiveSection('overview')} />
      ) : activeSection === 'ai' ? (
        <AiSettingsSection onBack={() => setActiveSection('overview')} />
      ) : activeSection === 'media' ? (
        (() => {
          const mediaCategory = categories.find((c) => c.code === 'media');
          const mediaRows = (mediaCategory?.settings || []).map((s) => ({
            key: s.key, value: s.value, help_text: s.help_text, data_type: s.data_type,
          }));
          return (
            <MediaSettingsSection
              onBack={() => setActiveSection('overview')}
              isSuperAdmin={isSuperAdmin}
              configRows={mediaRows}
              onSaveConfig={async (key, value) => {
                if (!isAdmin) { setError('You do not have permission to modify settings'); return; }
                const res = await fetch('/api/configuration', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ settings: { [key]: value }, reason: 'Media Engine configuration update' }),
                });
                const data = await res.json();
                if (data.success) { setSuccess('Setting updated'); setTimeout(() => setSuccess(null), 3000); await fetchConfiguration(); }
                else { setError(Array.isArray(data.details) ? data.details.join('; ') : (data.error || 'Update failed')); }
              }}
            />
          );
        })()
      ) : activeSection === 'registration' ? (
        (() => {
          const regCategory = categories.find((c) => c.code === 'registration');
          const regRows = (regCategory?.settings || []).map((s) => ({
            key: s.key, value: s.value, help_text: s.help_text, data_type: s.data_type,
          }));
          // Derive the public URL from the current origin so it is always
          // correct per deployment.
          const publicUrl =
            typeof window !== 'undefined'
              ? `${window.location.origin}/register/member`
              : '/register/member';
          return (
            <RegistrationSettingsSection
              onBack={() => setActiveSection('overview')}
              isAdmin={isAdmin}
              configRows={regRows}
              publicUrl={publicUrl}
              onSaveConfig={async (key, value) => {
                if (!isAdmin) { setError('You do not have permission to modify settings'); return; }
                const res = await fetch('/api/configuration', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ settings: { [key]: value }, reason: 'Member Registration configuration update' }),
                });
                const data = await res.json();
                if (data.success) { setSuccess('Setting updated'); setTimeout(() => setSuccess(null), 3000); await fetchConfiguration(); }
                else { setError(Array.isArray(data.details) ? data.details.join('; ') : (data.error || 'Update failed')); }
              }}
            />
          );
        })()
      ) : activeSection === 'transactions' ? (
        <TransactionsSettingsSection
          onBack={() => setActiveSection('overview')}
          isAdmin={isAdmin}
          canConfigureRules={isSuperAdmin}
        />
      ) : activeSection === 'system' ? (
        renderSystemSection()
      ) : activeSection === 'smtp' && currentCategory ? (
        <div>
          {renderSettingsForm(currentCategory)}
          
          {/* SMTP Test Connection Section */}
          <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Test SMTP Connection</h3>
                <p className="text-sm text-gray-600">Verify your SMTP settings by sending a test email</p>
              </div>
              <button
                onClick={handleTestSmtp}
                disabled={smtpTesting}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  smtpTesting 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {smtpTesting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Testing...
                  </span>
                ) : (
                  'Test Connection'
                )}
              </button>
            </div>
            
            {smtpTestResult && (
              <div className={`rounded-lg p-4 ${
                smtpTestResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{smtpTestResult.success ? '✅' : '❌'}</span>
                  <div>
                    <p className={`font-medium ${smtpTestResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {smtpTestResult.success ? 'Connection Successful!' : 'Connection Failed'}
                    </p>
                    <p className="text-sm mt-1">{smtpTestResult.message}</p>
                    {smtpTestResult.error && (
                      <p className="text-sm text-red-600 mt-1 font-mono bg-red-100 p-2 rounded">
                        {smtpTestResult.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : currentCategory ? (
        renderSettingsForm(currentCategory)
      ) : (
        <div className="text-center py-12 text-gray-500">
          Category not found
        </div>
      )}
    </div>
  );
}
