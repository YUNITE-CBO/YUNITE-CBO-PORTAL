'use client';

import { useEffect, useState } from 'react';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings');
        const result = await response.json();
        
        if (result.success) {
          setSettings(result.data);
        } else {
          setError(result.error || 'Failed to load settings');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    setSaving(key);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSettings((prev) =>
          prev.map((s) => (s.key === key ? { ...s, value } : s))
        );
      } else {
        setError(result.error || 'Failed to update setting');
      }
    } catch (err) {
      setError('Failed to update setting');
    } finally {
      setSaving(null);
    }
  };

  const groupedSettings = settings.reduce((acc, setting) => {
    const category = setting.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(setting);
    return acc;
  }, {} as Record<string, Setting[]>);

  const categoryLabels: Record<string, string> = {
    organization: 'Organization',
    financial: 'Financial',
    membership: 'Membership',
    loan: 'Loan',
    system: 'System',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <div key={category} className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-medium text-gray-900">
              {categoryLabels[category] || category}
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {categorySettings.map((setting) => (
              <div key={setting.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{setting.key}</p>
                  {setting.description && (
                    <p className="text-sm text-gray-500">{setting.description}</p>
                  )}
                </div>
                <div className="ml-4 flex items-center">
                  <input
                    type="text"
                    value={setting.value}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev.map((s) =>
                          s.key === setting.key ? { ...s, value: e.target.value } : s
                        )
                      )
                    }
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={saving === setting.key}
                  />
                  <button
                    onClick={() => handleUpdate(setting.key, setting.value)}
                    disabled={saving === setting.key}
                    className="ml-2 px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving === setting.key ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
