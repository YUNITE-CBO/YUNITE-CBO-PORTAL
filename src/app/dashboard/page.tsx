'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
  total_loan_applications: number;
  pending_loan_applications: number;
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
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
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

  const getActivityIcon = (type: string) => {
    const icons: Record<string, string> = {
      deposit: '💰',
      withdrawal: '💸',
      savings: '🏦',
      loan: '🏧',
      fine: '⚠️',
      contribution: '🎯',
      registration: '👤',
      default: '📋',
    };
    return icons[type] || icons.default;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          <h3 className="font-semibold">Unable to load dashboard</h3>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchDashboard}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">YUNITE Enterprise OS</h1>
          <p className="text-gray-500 mt-1">
            Live Dashboard • {currentTime.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • {currentTime.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/members"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <span>👥</span> Register Member
          </Link>
          <Link
            href="/dashboard/transactions"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>💰</span> New Transaction
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`p-4 rounded-lg border flex items-center gap-3 ${
                alert.type === 'warning'
                  ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  : alert.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <span className="text-xl">
                {alert.type === 'warning' ? '⚠️' : alert.type === 'error' ? '🚨' : 'ℹ️'}
              </span>
              <div>
                <div className="font-medium">{alert.title}</div>
                <div className="text-sm">{alert.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Members"
          value={stats?.total_members || 0}
          subtitle={`${stats?.active_members || 0} active • ${stats?.pending_members || 0} pending`}
          icon="👥"
          color="blue"
          trend="up"
        />
        <StatCard
          title="Total Savings"
          value={formatCurrency(stats?.total_savings || 0)}
          icon="🏦"
          color="green"
          trend="up"
        />
        <StatCard
          title="Outstanding Loans"
          value={formatCurrency(stats?.total_loans_outstanding || 0)}
          icon="🏧"
          color="orange"
          subtitle={`${stats?.pending_loan_applications || 0} pending applications`}
        />
        <StatCard
          title="Total Shares"
          value={(stats?.total_shares || 0).toLocaleString()}
          icon="📈"
          color="purple"
          trend="up"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MiniStatCard
          title="Contributions"
          value={formatCurrency(stats?.total_contributions || 0)}
          icon="🎯"
          color="teal"
        />
        <MiniStatCard
          title="Welfare Fund"
          value={formatCurrency(stats?.total_welfare || 0)}
          icon="🛡️"
          color="indigo"
        />
        <MiniStatCard
          title="Pending Fines"
          value={formatCurrency(stats?.total_fines_pending || 0)}
          icon="⚠️"
          color="red"
        />
        <MiniStatCard
          title="Loan Applications"
          value={(stats?.total_loan_applications || 0).toString()}
          icon="📋"
          color="cyan"
        />
        <MiniStatCard
          title="Active Loans"
          value={(stats?.total_loan_applications || 0).toString()}
          icon="✅"
          color="emerald"
        />
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/dashboard/members"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">👥</span>
              <div>
                <div className="font-medium text-gray-900">Register New Member</div>
                <div className="text-sm text-gray-500">Add a new member to the system</div>
              </div>
            </Link>
            <Link
              href="/dashboard/transactions"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">💰</span>
              <div>
                <div className="font-medium text-gray-900">Post Transaction</div>
                <div className="text-sm text-gray-500">Deposit, withdrawal, or transfer</div>
              </div>
            </Link>
            <Link
              href="/dashboard/loans"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">🏦</span>
              <div>
                <div className="font-medium text-gray-900">Process Loan</div>
                <div className="text-sm text-gray-500">Approve or disburse loans</div>
              </div>
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl">⚙️</span>
              <div>
                <div className="font-medium text-gray-900">Settings</div>
                <div className="text-sm text-gray-500">Configure organization rules</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/dashboard/transactions" className="text-sm text-indigo-600 hover:text-indigo-700">
              View all →
            </Link>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                <span className="text-4xl">📋</span>
                <p className="mt-2">No recent activity</p>
                <p className="text-sm">Transactions will appear here</p>
              </div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getActivityIcon(item.type)}</span>
                    <div>
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="text-sm text-gray-500">
                        {item.member_name && `${item.member_name} • `}
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  </div>
                  {item.amount && (
                    <div className={`text-right font-medium ${
                      item.type === 'withdrawal' || item.type === 'fine' 
                        ? 'text-red-600' 
                        : 'text-green-600'
                    }`}>
                      {item.type === 'withdrawal' || item.type === 'fine' ? '-' : '+'}
                      {formatCurrency(item.amount)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-gray-500">{title}</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{value}</div>
          {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
          color === 'blue' ? 'bg-blue-100' :
          color === 'green' ? 'bg-green-100' :
          color === 'orange' ? 'bg-orange-100' :
          color === 'purple' ? 'bg-purple-100' :
          'bg-gray-100'
        }`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className={`mt-3 flex items-center gap-1 text-sm ${
          trend === 'up' ? 'text-green-600' : 'text-red-600'
        }`}>
          <span>{trend === 'up' ? '↑' : '↓'}</span>
          <span>{trend === 'up' ? 'Growing' : 'Declining'}</span>
        </div>
      )}
    </div>
  );
}

function MiniStatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    red: 'bg-red-50 text-red-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${colorClasses[color] || 'bg-gray-100'}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500">{title}</div>
          <div className="font-semibold text-gray-900">{value}</div>
        </div>
      </div>
    </div>
  );
}
