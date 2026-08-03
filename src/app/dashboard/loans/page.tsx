'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface Loan {
  id: string;
  loan_number: string;
  member_id: string;
  member_name?: string;
  loan_type: string;
  principal_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  application_date: string;
  repayment_period_months: number;
  monthly_repayment: number;
}

interface LoanStats {
  pending_applications: number;
  active_loans: number;
  total_disbursed: number;
  total_outstanding: number;
}

interface LoanForm {
  member_id: string;
  principal_amount: string;
  loan_type: string;
  purpose: string;
  repayment_period_months: string;
}

const LOAN_TYPES = [
  { value: 'emergency', label: 'Emergency Loan' },
  { value: 'development', label: 'Development Loan' },
  { value: 'school_fees', label: 'School Fees Loan' },
  { value: 'business', label: 'Business Loan' },
  { value: 'consumption', label: 'Consumption Loan' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Loans' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'defaulted', label: 'Defaulted' },
];

export default function LoansPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [stats, setStats] = useState<LoanStats>({
    pending_applications: 0,
    active_loans: 0,
    total_disbursed: 0,
    total_outstanding: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LoanForm>({
    member_id: '',
    principal_amount: '',
    loan_type: 'emergency',
    purpose: '',
    repayment_period_months: '12',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayType, setRepayType] = useState<'partial' | 'full'>('partial');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [membersRes, loansRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/loans'),
      ]);
      const membersData = await membersRes.json();
      const loansData = await loansRes.json();

      if (membersData.success) setMembers(membersData.data || []);
      if (loansData.success) {
        setLoans(loansData.data || []);
        calculateStats(loansData.data || []);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (loansData: Loan[]) => {
    const pending = loansData.filter((l) => l.status === 'pending').length;
    const active = loansData.filter((l) => ['disbursed', 'active'].includes(l.status)).length;
    const disbursed = loansData
      .filter((l) => ['disbursed', 'active', 'completed'].includes(l.status))
      .reduce((sum, l) => sum + l.principal_amount, 0);
    const outstanding = loansData
      .filter((l) => ['disbursed', 'active'].includes(l.status))
      .reduce((sum, l) => sum + l.amount_due, 0);

    setStats({
      pending_applications: pending,
      active_loans: active,
      total_disbursed: disbursed,
      total_outstanding: outstanding,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.member_id || !form.principal_amount) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: form.member_id,
          loan_type: form.loan_type,
          principal_amount: parseFloat(form.principal_amount),
          purpose: form.purpose,
          repayment_period_months: parseInt(form.repayment_period_months),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setForm({
          member_id: '',
          principal_amount: '',
          loan_type: 'emergency',
          purpose: '',
          repayment_period_months: '12',
        });
        setShowForm(false);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to submit application');
      }
    } catch {
      setError('Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveLoan = async (loan: Loan) => {
    setActionLoading(loan.id);
    setError(null);

    try {
      const res = await fetch('/api/loans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: loan.id,
          action: 'approve',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to approve loan');
      }
    } catch {
      setError('Failed to approve loan');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectLoan = async (loan: Loan) => {
    setActionLoading(loan.id);
    setError(null);

    try {
      const res = await fetch('/api/loans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: loan.id,
          action: 'reject',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to reject loan');
      }
    } catch {
      setError('Failed to reject loan');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisburseLoan = async (loan: Loan) => {
    setActionLoading(loan.id);
    setError(null);

    try {
      const res = await fetch('/api/loans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: loan.id,
          action: 'disburse',
          disbursement_date: new Date().toISOString().split('T')[0],
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to disburse loan');
      }
    } catch {
      setError('Failed to disburse loan');
    } finally {
      setActionLoading(null);
    }
  };

  const openRepayModal = (loan: Loan) => {
    setSelectedLoan(loan);
    setRepayAmount(loan.amount_due.toString());
    setRepayType('full');
    setShowRepayModal(true);
  };

  const handleRepayLoan = async () => {
    if (!selectedLoan || !repayAmount) return;
    
    setActionLoading(selectedLoan.id);
    setError(null);

    try {
      const res = await fetch('/api/loans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id: selectedLoan.id,
          action: 'repay',
          amount: repayType === 'full' ? selectedLoan.amount_due : parseFloat(repayAmount),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setShowRepayModal(false);
        setRepayAmount('');
        setSelectedLoan(null);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to record repayment');
      }
    } catch {
      setError('Failed to record repayment');
    } finally {
      setActionLoading(null);
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      disbursed: 'bg-green-100 text-green-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      defaulted: 'bg-red-100 text-red-800',
      rejected: 'bg-red-100 text-red-800',
      written_off: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredLoans = statusFilter === 'all'
    ? loans
    : loans.filter((l) => l.status === statusFilter);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Loans Management</h1>
          <p className="text-gray-500 mt-1">Process loan applications and track repayments</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <span>{showForm ? '✕' : '➕'}</span>
          {showForm ? 'Close Form' : 'New Application'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center text-2xl">
              📋
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Applications</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending_applications}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">
              ✅
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Loans</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active_loans}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">
              💰
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Disbursed</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.total_disbursed)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Outstanding</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.total_outstanding)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Application Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Loan Application</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {submitSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Loan application submitted successfully!
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Member *
              </label>
              <select
                value={form.member_id}
                onChange={(e) => setForm((prev) => ({ ...prev, member_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name} ({m.member_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loan Type *
              </label>
              <select
                value={form.loan_type}
                onChange={(e) => setForm((prev) => ({ ...prev, loan_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                {LOAN_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Principal Amount (KES) *
              </label>
              <input
                type="number"
                value={form.principal_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, principal_amount: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Repayment Period (Months) *
              </label>
              <select
                value={form.repayment_period_months}
                onChange={(e) => setForm((prev) => ({ ...prev, repayment_period_months: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                {[3, 6, 12, 18, 24, 36, 48, 60].map((months) => (
                  <option key={months} value={months}>
                    {months} months
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purpose
              </label>
              <textarea
                value={form.purpose}
                onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                placeholder="Describe the purpose of this loan..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    Submit Application
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="flex flex-wrap gap-2 p-4">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Loans ({filteredLoans.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Loan Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Repayment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">🏦</span>
                    <p className="mt-2">No loans found</p>
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-indigo-600">{loan.loan_number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {loan.member_name || 'Unknown Member'}
                      </div>
                      <div className="text-xs text-gray-500">{loan.loan_type}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(loan.principal_amount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Total: {formatCurrency(loan.total_amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(loan.status)}`}>
                        {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(loan.monthly_repayment)}
                      <div className="text-xs text-gray-500">
                        {loan.repayment_period_months} months
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2 flex-wrap">
                        {loan.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproveLoan(loan)}
                              disabled={actionLoading === loan.id}
                              className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              {actionLoading === loan.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : (
                                <>✓ Approve</>
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectLoan(loan)}
                              disabled={actionLoading === loan.id}
                              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {loan.status === 'approved' && (
                          <button
                            onClick={() => handleDisburseLoan(loan)}
                            disabled={actionLoading === loan.id}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {actionLoading === loan.id ? (
                              <span className="animate-spin">⏳</span>
                            ) : (
                              <>💰 Disburse</>
                            )}
                          </button>
                        )}
                        {(loan.status === 'disbursed' || loan.status === 'active') && (
                          <button
                            onClick={() => openRepayModal(loan)}
                            disabled={actionLoading === loan.id}
                            className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            💵 Repay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Repay Loan Modal */}
      {showRepayModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Record Loan Repayment</h2>
                <button
                  onClick={() => setShowRepayModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Loan:</span>
                    <span className="ml-2 font-medium">{selectedLoan.loan_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Principal:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedLoan.principal_amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Amount:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedLoan.total_amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Amount Paid:</span>
                    <span className="ml-2 font-medium text-green-600">{formatCurrency(selectedLoan.amount_paid)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Amount Due:</span>
                    <span className="ml-2 font-bold text-red-600">{formatCurrency(selectedLoan.amount_due)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repayment Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="repayType"
                      checked={repayType === 'partial'}
                      onChange={() => {
                        setRepayType('partial');
                        setRepayAmount('');
                      }}
                      className="w-4 h-4 text-indigo-600"
                    />
                    <span className="text-sm">Partial Payment</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="repayType"
                      checked={repayType === 'full'}
                      onChange={() => {
                        setRepayType('full');
                        setRepayAmount(selectedLoan.amount_due.toString());
                      }}
                      className="w-4 h-4 text-indigo-600"
                    />
                    <span className="text-sm">Full Payment</span>
                  </label>
                </div>
              </div>

              {repayType === 'partial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repayment Amount (KES)
                  </label>
                  <input
                    type="number"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder="Enter amount"
                    min="1"
                    max={selectedLoan.amount_due}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum: {formatCurrency(selectedLoan.amount_due)}
                  </p>
                </div>
              )}

              {repayType === 'full' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Full Repayment:</strong> {formatCurrency(selectedLoan.amount_due)}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowRepayModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRepayLoan}
                disabled={actionLoading !== null || !repayAmount || parseFloat(repayAmount) <= 0}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Processing...
                  </>
                ) : (
                  <>
                    💵 Record Repayment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
