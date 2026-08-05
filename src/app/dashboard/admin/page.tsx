'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SystemStats {
  totalMembers: number;
  activeMembers: number;
  totalLoans: number;
  pendingLoans: number;
  totalSavings: number;
  totalContributions: number;
  pendingFines: number;
}

interface ModuleInfo {
  name: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  status: 'active' | 'coming-soon';
  badge?: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAccess();
    fetchSystemStats();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.success || !['super_admin', 'admin'].includes(data.data?.user?.role)) {
        router.push('/dashboard');
        return;
      }

      if (data.data?.user?.role === 'super_admin') {
        setIsSuperAdmin(true);
      }
    } catch {
      router.push('/dashboard');
    }
  };

  const fetchSystemStats = async () => {
    try {
      const response = await fetch('/api/dashboard');
      const data = await response.json();

      if (data.success) {
        setStats({
          totalMembers: data.data.stats.total_members,
          activeMembers: data.data.stats.active_members,
          totalLoans: data.data.stats.total_loan_applications,
          pendingLoans: data.data.stats.pending_loan_applications,
          totalSavings: data.data.stats.total_savings,
          totalContributions: data.data.stats.total_contributions,
          pendingFines: data.data.stats.total_fines_pending,
        });
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const modules: ModuleInfo[] = [
    {
      name: 'User Management',
      description: 'Manage system users, roles, and permissions',
      icon: '👥',
      href: '/dashboard/admin/users',
      color: 'bg-blue-500',
      status: 'active',
    },
    {
      name: 'Login Activity',
      description: 'View user login history and security audit',
      icon: '🔐',
      href: '/dashboard/admin/login-activity',
      color: 'bg-purple-500',
      status: 'active',
    },
    {
      name: 'Settings',
      description: 'System configuration and preferences',
      icon: '⚙️',
      href: '/dashboard/settings',
      color: 'bg-gray-500',
      status: 'active',
    },
    {
      name: 'Members',
      description: 'Member management and registration',
      icon: '👥',
      href: '/dashboard/members',
      color: 'bg-green-500',
      status: 'active',
    },
    {
      name: 'Loans',
      description: 'Loan applications and approvals',
      icon: '🏦',
      href: '/dashboard/loans',
      color: 'bg-orange-500',
      status: 'active',
    },
    {
      name: 'Transactions',
      description: 'Financial transactions ledger',
      icon: '💰',
      href: '/dashboard/transactions',
      color: 'bg-yellow-500',
      status: 'active',
    },
    {
      name: 'Documents',
      description: 'Document upload and management',
      icon: '📄',
      href: '/dashboard/documents',
      color: 'bg-indigo-500',
      status: 'active',
    },
    {
      name: 'Compliance',
      description: 'Compliance tracking and reporting',
      icon: '✅',
      href: '/dashboard/compliance',
      color: 'bg-teal-500',
      status: 'active',
    },
    {
      name: 'Welfare',
      description: 'Welfare scheme management',
      icon: '🛡️',
      href: '/dashboard/welfare',
      color: 'bg-pink-500',
      status: 'active',
    },
    {
      name: 'Notifications',
      description: 'Notification templates and scheduling',
      icon: '🔔',
      href: '/dashboard/notifications',
      color: 'bg-red-500',
      status: 'active',
    },
    {
      name: 'Reports',
      description: 'Financial and operational reports',
      icon: '📈',
      href: '/dashboard/reports',
      color: 'bg-cyan-500',
      status: 'active',
    },
    {
      name: 'Audit Logs',
      description: 'System activity audit trail',
      icon: '📋',
      href: '/dashboard/audit-logs',
      color: 'bg-slate-500',
      status: 'active',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">
          {isSuperAdmin
            ? 'Super Administrator - Full system access'
            : 'Administrator - Limited system access'}
        </p>
      </div>

      {/* System Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Members</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalMembers || 0}</p>
              </div>
              <span className="text-4xl">👥</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Loans</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalLoans || 0}</p>
              </div>
              <span className="text-4xl">🏦</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Savings</p>
                <p className="text-3xl font-bold text-gray-900">
                  KES {(stats?.totalSavings || 0).toLocaleString()}
                </p>
              </div>
              <span className="text-4xl">💰</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Fines</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.pendingFines || 0}</p>
              </div>
              <span className="text-4xl">⚠️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/admin/users"
            className="bg-indigo-600 text-white rounded-xl p-6 hover:bg-indigo-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">👥</span>
              <div>
                <h3 className="font-semibold text-lg">Manage Users</h3>
                <p className="text-indigo-200 text-sm">Add, edit, or deactivate users</p>
              </div>
            </div>
          </Link>
          <Link
            href="/dashboard/admin/login-activity"
            className="bg-purple-600 text-white rounded-xl p-6 hover:bg-purple-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔐</span>
              <div>
                <h3 className="font-semibold text-lg">Login Activity</h3>
                <p className="text-purple-200 text-sm">View security audit trail</p>
              </div>
            </div>
          </Link>
          <Link
            href="/dashboard/settings"
            className="bg-gray-600 text-white rounded-xl p-6 hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚙️</span>
              <div>
                <h3 className="font-semibold text-lg">System Settings</h3>
                <p className="text-gray-200 text-sm">Configure system preferences</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Module Grid */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">All Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className="bg-white rounded-xl border p-6 hover:shadow-lg hover:border-indigo-300 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white`}>
                  {module.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">
                      {module.name}
                    </h3>
                    {module.status === 'coming-soon' && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{module.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* System Information */}
      <div className="mt-8 bg-gray-50 rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Version</span>
            <p className="font-medium text-gray-900">YUNITE Enterprise OS v1.3.0</p>
          </div>
          <div>
            <span className="text-gray-500">Framework</span>
            <p className="font-medium text-gray-900">Next.js 14.2.5</p>
          </div>
          <div>
            <span className="text-gray-500">Database</span>
            <p className="font-medium text-gray-900">PostgreSQL (Supabase)</p>
          </div>
          <div>
            <span className="text-gray-500">Environment</span>
            <p className="font-medium text-gray-900">Production</p>
          </div>
        </div>
      </div>
    </div>
  );
}
