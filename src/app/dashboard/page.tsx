'use client';

import { useEffect, useState } from 'react';

interface DashboardStats {
  total_members: number;
  active_members: number;
  pending_members: number;
  total_savings: number;
  total_shares: number;
  total_contributions: number;
  total_welfare: number;
  total_fines_pending: number;
  total_loans_outstanding: number;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  amount?: number;
  member_name?: string;
  created_at: string;
}

interface Alert {
  type: string;
  title: string;
  message: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();

      if (data.success) {
        setStats(data.data.stats);
        setActivity(data.data.recent_activity || []);
        setAlerts(data.data.alerts || []);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-3">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${
                  alert.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                    : alert.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <div className="font-medium">{alert.title}</div>
                <div className="text-sm">{alert.message}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Members"
            value={stats?.total_members || 0}
            subtitle={`${stats?.active_members || 0} active`}
            color="blue"
          />
          <StatCard
            title="Total Savings"
            value={formatCurrency(stats?.total_savings || 0)}
            color="green"
          />
          <StatCard
            title="Total Shares"
            value={stats?.total_shares || 0}
            color="purple"
          />
          <StatCard
            title="Loans Outstanding"
            value={formatCurrency(stats?.total_loans_outstanding || 0)}
            color="orange"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Contributions"
            value={formatCurrency(stats?.total_contributions || 0)}
            color="teal"
          />
          <StatCard
            title="Welfare Fund"
            value={formatCurrency(stats?.total_welfare || 0)}
            color="indigo"
          />
          <StatCard
            title="Pending Fines"
            value={formatCurrency(stats?.total_fines_pending || 0)}
            color="red"
          />
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y">
            {activity.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No recent activity
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{item.description}</div>
                    <div className="text-sm text-gray-500">
                      {item.member_name && `${item.member_name} · `}
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                  {item.amount && (
                    <div className="text-right font-medium text-gray-900">
                      {formatCurrency(item.amount)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'indigo' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`rounded-lg border p-6 ${colors[color]}`}>
      <div className="text-sm font-medium opacity-75">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {subtitle && <div className="text-sm mt-1 opacity-75">{subtitle}</div>}
    </div>
  );
}
