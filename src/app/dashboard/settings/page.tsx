'use client';

/**
 * Enhanced Settings Page - Phase 4
 * Configuration Management Framework
 * 
 * Every setting always loads from the database.
 * No placeholder text when values exist.
 * Configuration status indicators for each section.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  data_type: string;
  is_encrypted: boolean;
  is_public: boolean;
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

type ActiveSection = 'overview' | 'organization' | 'financial' | 'loan' | 'security' | 'smtp' | 'notifications' | 'welfare' | 'contributions' | 'compliance' | 'history';

export default function EnhancedSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  
  // Current user state
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Configuration data
  const [categories, setCategories] = useState<ConfigurationCategory[]>([]);
  const [status, setStatus] = useState<ConfigurationStatus | null>(null);
  const [history, setHistory] = useState<ConfigurationHistory[]>([]);
  
  // Edit mode
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);

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
      }
    } catch (err) {
      console.error('Failed to fetch session:', err);
    }
  };

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
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
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
                  {category.code === 'security' && '🔒'}
                  {category.code === 'smtp' && '📧'}
                  {category.code === 'notifications' && '🔔'}
                  {category.code === 'welfare' && '❤️'}
                  {category.code === 'contributions' && '🎁'}
                  {category.code === 'compliance' && '📋'}
                  {category.code === 'branding' && '🎨'}
                  {!['organization', 'financial', 'loan', 'security', 'smtp', 'notifications', 'welfare', 'contributions', 'compliance', 'branding'].includes(category.code) && '⚙️'}
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
          Configure your organization's settings. All values are loaded directly from the database.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
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
