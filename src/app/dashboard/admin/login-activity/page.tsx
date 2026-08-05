'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LoginActivity {
  id: string;
  user_id: string;
  email: string;
  event_type: string;
  ip_address: string;
  user_agent: string;
  device_info: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
  user_name: string;
  user_email: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  totalPages: number;
}

interface ActivityStats {
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  unique_users: number;
  success_rate: number;
}

export default function LoginActivityPage() {
  const [activities, setActivities] = useState<LoginActivity[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [eventFilter, setEventFilter] = useState<string>('');
  const [successFilter, setSuccessFilter] = useState<string>('');
  const [selectedActivity, setSelectedActivity] = useState<LoginActivity | null>(null);

  useEffect(() => {
    fetchActivities();
  }, [currentPage, eventFilter, successFilter]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: String((currentPage - 1) * 20),
      });
      if (eventFilter) params.append('event_type', eventFilter);
      if (successFilter) params.append('success', successFilter);

      const res = await fetch(`/api/admin/login-activity?${params}`);
      const data = await res.json();

      if (data.success) {
        setActivities(data.data || []);
        setPagination(data.pagination);
        
        // Calculate stats
        if (data.data && data.data.length > 0) {
          const successful = data.data.filter((a: LoginActivity) => a.success).length;
          const failed = data.data.filter((a: LoginActivity) => !a.success).length;
          const uniqueUsers = new Set(data.data.map((a: LoginActivity) => a.user_id)).size;
          setStats({
            total_logins: data.pagination.total,
            successful_logins: successful,
            failed_logins: failed,
            unique_users: uniqueUsers,
            success_rate: Math.round((successful / data.data.length) * 100),
          });
        }
      } else {
        setError(data.error || 'Failed to fetch login activity');
      }
    } catch {
      setError('Failed to fetch login activity');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTime(date);
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      login: 'Login',
      logout: 'Logout',
      password_reset: 'Password Reset',
      failed_login: 'Failed Login',
      session_expired: 'Session Expired',
    };
    return labels[type] || type;
  };

  const getEventTypeBadge = (type: string, success: boolean) => {
    if (!success) {
      return 'bg-red-100 text-red-800';
    }
    switch (type) {
      case 'login': return 'bg-green-100 text-green-800';
      case 'logout': return 'bg-gray-100 text-gray-800';
      case 'password_reset': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const parseDeviceInfo = (info: string | null): { browser?: string; os?: string; device?: string } => {
    if (!info) return {};
    try {
      return JSON.parse(info);
    } catch {
      return {};
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard/admin/users" className="text-gray-500 hover:text-gray-700">
              ← Back to Users
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Login Activity</h1>
          <p className="text-gray-500 mt-1">Track user login attempts and sessions</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-gray-500">Total Events</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_logins || pagination?.total || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-green-100 text-sm">Successful</p>
          <p className="text-2xl font-bold">{stats?.successful_logins || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-red-100 text-sm">Failed</p>
          <p className="text-2xl font-bold">{stats?.failed_logins || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-gray-500">Unique Users</p>
          <p className="text-2xl font-bold text-purple-600">{stats?.unique_users || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-2xl font-bold text-indigo-600">{stats?.success_rate || 0}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${stats?.success_rate || 0}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          ⚠️ {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={eventFilter}
            onChange={(e) => { setEventFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Events</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="password_reset">Password Reset</option>
            <option value="failed_login">Failed Login</option>
          </select>
          <select
            value={successFilter}
            onChange={(e) => { setSuccessFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Results</option>
            <option value="true">Successful</option>
            <option value="false">Failed</option>
          </select>
          <div className="flex-1 text-right text-sm text-gray-500">
            Page {currentPage} of {pagination?.totalPages || 1}
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Activity ({pagination?.total || 0})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl animate-spin">⏳</span>
            <p className="mt-2">Loading activity...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <span className="text-4xl">📋</span>
            <p className="mt-2">No login activity found</p>
          </div>
        ) : (
          <div className="divide-y">
            {activities.map((activity) => {
              const device = parseDeviceInfo(activity.device_info);
              return (
                <div
                  key={activity.id}
                  onClick={() => setSelectedActivity(activity)}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        activity.success 
                          ? 'bg-green-100 text-green-600' 
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {activity.success ? '✓' : '✕'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">
                            {activity.user_name || activity.email}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEventTypeBadge(activity.event_type, activity.success)}`}>
                            {getEventTypeLabel(activity.event_type)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>{activity.ip_address || 'Unknown IP'}</span>
                          {device.browser && (
                            <span>{device.browser} on {device.os || 'Unknown OS'}</span>
                          )}
                          <span>{formatTimeAgo(activity.created_at)}</span>
                        </div>
                        {activity.failure_reason && (
                          <p className="text-sm text-red-600 mt-1">
                            Reason: {activity.failure_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">{formatDateTime(activity.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={currentPage >= pagination.totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedActivity.success 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-red-100 text-red-600'
                  }`}>
                    {selectedActivity.success ? '✓' : '✕'}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedActivity.user_name || selectedActivity.email}
                    </h3>
                    <p className="text-sm text-gray-500">{selectedActivity.user_email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Event Type</label>
                  <p className="text-sm text-gray-900 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEventTypeBadge(selectedActivity.event_type, selectedActivity.success)}`}>
                      {getEventTypeLabel(selectedActivity.event_type)}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Status</label>
                  <p className={`text-sm font-medium mt-1 ${selectedActivity.success ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedActivity.success ? 'Successful' : 'Failed'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">IP Address</label>
                  <p className="text-sm text-gray-900 font-mono mt-1">{selectedActivity.ip_address || 'Unknown'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">User ID</label>
                  <p className="text-sm text-gray-900 font-mono mt-1">{selectedActivity.user_id || 'N/A'}</p>
                </div>
              </div>

              {selectedActivity.user_agent && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">User Agent</label>
                  <p className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded break-all">
                    {selectedActivity.user_agent}
                  </p>
                </div>
              )}

              {selectedActivity.device_info && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Device Info</label>
                  <div className="mt-1 bg-gray-50 p-3 rounded">
                    {Object.entries(parseDeviceInfo(selectedActivity.device_info)).map(([key, value]) => (
                      <div key={key} className="flex gap-2 text-sm">
                        <span className="text-gray-500 capitalize">{key}:</span>
                        <span className="text-gray-900">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedActivity.failure_reason && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Failure Reason</label>
                  <p className="text-sm text-red-600 mt-1">{selectedActivity.failure_reason}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-500">Timestamp</label>
                <p className="text-sm text-gray-900 mt-1">{formatDateTime(selectedActivity.created_at)}</p>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedActivity(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
