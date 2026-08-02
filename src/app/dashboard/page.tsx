'use client';

import { useEffect, useState } from 'react';

interface DashboardData {
  stats: {
    total_members: number;
    active_members: number;
    new_registrations: number;
    total_savings: number;
    total_shares: number;
    total_loans_disbursed: number;
    total_loans_outstanding: number;
    total_fines_pending: number;
    total_contributions: number;
  };
  activity: Array<{
    id: string;
    type: string;
    description: string;
    member_name?: string;
    amount?: number;
    user_name: string;
    created_at: string;
  }>;
  alerts: Array<{
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    action_url?: string;
  }>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch('/api/dashboard');
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to load dashboard');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <span className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, index) => (
            <div
              key={index}
              className={`px-4 py-3 rounded-md flex items-center justify-between ${
                alert.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : alert.type === 'warning'
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}
            >
              <div className="flex items-center">
                <span className="font-medium">{alert.title}:</span>
                <span className="ml-2">{alert.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Members</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {data.stats.total_members}
            </dd>
            <p className="mt-1 text-sm text-gray-500">
              {data.stats.active_members} active
            </p>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Savings</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(data.stats.total_savings)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Shares</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(data.stats.total_shares)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Loans Disbursed</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(data.stats.total_loans_disbursed)}
            </dd>
            <p className="mt-1 text-sm text-red-500">
              Outstanding: {formatCurrency(data.stats.total_loans_outstanding)}
            </p>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Pending Fines</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(data.stats.total_fines_pending)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Contributions</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(data.stats.total_contributions)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">New This Month</dt>
            <dd className="mt-1 text-3xl font-semibold text-green-600">
              +{data.stats.new_registrations}
            </dd>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {data.activity.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No recent activity
            </div>
          ) : (
            data.activity.map((item) => (
              <div key={item.id} className="px-4 py-4 sm:px-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.description}
                    {item.member_name && (
                      <span className="text-gray-500"> - {item.member_name}</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    by {item.user_name} • {formatDate(item.created_at)}
                  </p>
                </div>
                {item.amount && (
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(item.amount)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
