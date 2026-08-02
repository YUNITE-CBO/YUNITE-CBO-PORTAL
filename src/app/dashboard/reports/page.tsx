'use client';

import { useEffect, useState } from 'react';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
}

interface DashboardStats {
  total_members: number;
  active_members: number;
  pending_members: number;
  total_savings: number;
  total_shares: number;
  total_contributions: number;
  total_loans_disbursed: number;
  total_loans_outstanding: number;
  total_fines_pending: number;
}

interface MemberStats {
  by_gender: Record<string, number>;
  by_status: Record<string, number>;
  by_occupation: Record<string, number>;
  new_this_month: number;
}

const REPORT_CARDS: ReportCard[] = [
  {
    id: 'financial-summary',
    title: 'Financial Summary',
    description: 'Overview of all financial accounts, balances, and transactions',
    icon: '💰',
    color: 'green',
    route: '/dashboard/reports/financial-summary',
  },
  {
    id: 'member-statistics',
    title: 'Member Statistics',
    description: 'Member demographics, growth trends, and compliance status',
    icon: '👥',
    color: 'blue',
    route: '/dashboard/reports/member-statistics',
  },
  {
    id: 'loan-report',
    title: 'Loan Report',
    description: 'Loan portfolio, disbursements, repayments, and defaults',
    icon: '🏦',
    color: 'orange',
    route: '/dashboard/reports/loans',
  },
  {
    id: 'transaction-report',
    title: 'Transaction Report',
    description: 'Detailed transaction history with filters and export',
    icon: '📋',
    color: 'purple',
    route: '/dashboard/reports/transactions',
  },
  {
    id: 'contributions-report',
    title: 'Contributions Report',
    description: 'Campaign performance and contribution tracking',
    icon: '🎯',
    color: 'indigo',
    route: '/dashboard/reports/contributions',
  },
  {
    id: 'fines-report',
    title: 'Fines Report',
    description: 'Fines issued, collected, pending, and waived',
    icon: '⚠️',
    color: 'red',
    route: '/dashboard/reports/fines',
  },
];

const COLOR_CLASSES: Record<string, { bg: string; icon: string }> = {
  green: { bg: 'bg-green-100', icon: 'text-green-600' },
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600' },
  orange: { bg: 'bg-orange-100', icon: 'text-orange-600' },
  purple: { bg: 'bg-purple-100', icon: 'text-purple-600' },
  indigo: { bg: 'bg-indigo-100', icon: 'text-indigo-600' },
  red: { bg: 'bg-red-100', icon: 'text-red-600' },
};

export default function ReportsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [memberStats, setMemberStats] = useState<MemberStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('this_month');
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();

      if (data.success) {
        setStats(data.data.stats);
      }

      const membersRes = await fetch('/api/members');
      const membersData = await membersRes.json();
      if (membersData.success) {
        calculateMemberStats(membersData.data || []);
      }
    } catch {
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const calculateMemberStats = (members: Array<{ gender?: string; status: string; occupation?: string }>) => {
    const byGender: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byOccupation: Record<string, number> = {};

    members.forEach((m) => {
      if (m.gender) {
        byGender[m.gender] = (byGender[m.gender] || 0) + 1;
      }
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      if (m.occupation) {
        byOccupation[m.occupation] = (byOccupation[m.occupation] || 0) + 1;
      }
    });

    setMemberStats({
      by_gender: byGender,
      by_status: byStatus,
      by_occupation: byOccupation,
      new_this_month: members.length,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExport = async (reportType: string) => {
    setExporting(reportType);
    
    // Simulate export action
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // In a real app, this would trigger a download
    alert(`Exporting ${reportType} report...`);
    
    setExporting(null);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Generate and export financial and operational reports</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
            <option value="all_time">All Time</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">
              👥
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Members</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total_members || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">
              💰
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Savings</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_savings || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">
              🏦
            </div>
            <div>
              <p className="text-sm text-gray-500">Loans Disbursed</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_loans_disbursed || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl">
              🎯
            </div>
            <div>
              <p className="text-sm text-gray-500">Contributions</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats?.total_contributions || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Report Cards */}
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {REPORT_CARDS.map((card) => {
          const colors = COLOR_CLASSES[card.color];
          return (
            <div
              key={card.id}
              className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center text-2xl`}>
                  {card.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{card.description}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <span className="text-xs text-gray-500">Updated: Today</span>
                <button
                  onClick={() => handleExport(card.id)}
                  disabled={exporting === card.id}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    exporting === card.id
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  {exporting === card.id ? (
                    <span className="flex items-center gap-1">
                      <span className="animate-spin">⏳</span> Exporting...
                    </span>
                  ) : (
                    '📥 Export'
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Financial Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Financial Overview */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Financial Overview</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Savings</span>
              <span className="font-semibold text-green-600">{formatCurrency(stats?.total_savings || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Shares</span>
              <span className="font-semibold text-indigo-600">{formatCurrency(stats?.total_shares || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Contributions</span>
              <span className="font-semibold text-purple-600">{formatCurrency(stats?.total_contributions || 0)}</span>
            </div>
            <div className="border-t pt-4 flex justify-between items-center">
              <span className="text-gray-600 font-medium">Total Disbursed (Loans)</span>
              <span className="font-semibold text-orange-600">{formatCurrency(stats?.total_loans_disbursed || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Outstanding Loans</span>
              <span className="font-semibold text-red-600">{formatCurrency(stats?.total_loans_outstanding || 0)}</span>
            </div>
          </div>
        </div>

        {/* Member Statistics */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Member Statistics</h2>
          
          {/* Status Distribution */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-3">By Status</h3>
            <div className="space-y-2">
              {stats && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      Active
                    </span>
                    <span className="font-medium">{stats.active_members}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                      Pending
                    </span>
                    <span className="font-medium">{stats.pending_members}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Gender Distribution */}
          {memberStats && Object.keys(memberStats.by_gender).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">By Gender</h3>
              <div className="flex gap-4">
                {Object.entries(memberStats.by_gender).map(([gender, count]) => (
                  <div key={gender} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 capitalize">{gender}:</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Quick Export</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => handleExport('excel-financial')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">📊</span>
            <div className="text-left">
              <div className="font-medium text-gray-900">Excel</div>
              <div className="text-xs text-gray-500">Financial Report</div>
            </div>
          </button>
          
          <button
            onClick={() => handleExport('pdf-members')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">📄</span>
            <div className="text-left">
              <div className="font-medium text-gray-900">PDF</div>
              <div className="text-xs text-gray-500">Member List</div>
            </div>
          </button>
          
          <button
            onClick={() => handleExport('csv-transactions')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">📋</span>
            <div className="text-left">
              <div className="font-medium text-gray-900">CSV</div>
              <div className="text-xs text-gray-500">Transactions</div>
            </div>
          </button>
          
          <button
            onClick={() => handleExport('pdf-statement')}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">📑</span>
            <div className="text-left">
              <div className="font-medium text-gray-900">PDF</div>
              <div className="text-xs text-gray-500">Account Statement</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
