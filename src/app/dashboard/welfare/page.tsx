'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
}

interface WelfareTransaction {
  id: string;
  transaction_ref: string;
  member_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_number: string | null;
  posted_at: string;
  created_at: string;
  member?: {
    id: string;
    member_number: string;
    first_name: string;
    last_name: string;
  };
}

interface WelfareSummary {
  total_deposits: number;
  total_disbursements: number;
  balance: number;
}

interface WelfareForm {
  member_id: string;
  type: 'deposit' | 'disbursement';
  amount: string;
  description: string;
  reference_number: string;
}

export default function WelfarePage() {
  const [transactions, setTransactions] = useState<WelfareTransaction[]>([]);
  const [summary, setSummary] = useState<WelfareSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'deposit' | 'disbursement'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState<WelfareForm>({
    member_id: '',
    type: 'deposit',
    amount: '',
    description: '',
    reference_number: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [welfareRes, membersRes] = await Promise.all([
        fetch('/api/welfare'),
        fetch('/api/members'),
      ]);
      const welfareData = await welfareRes.json();
      const membersData = await membersRes.json();

      if (welfareData.success) {
        setTransactions(welfareData.data || []);
        setSummary(welfareData.summary);
      }
      if (membersData.success) {
        setMembers(membersData.data || []);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.member_id || !form.amount) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/welfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: form.member_id,
          amount: parseFloat(form.amount),
          type: form.type,
          description: form.description,
          reference_number: form.reference_number,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setForm({
          member_id: '',
          type: 'deposit',
          amount: '',
          description: '',
          reference_number: '',
        });
        setShowForm(false);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to process welfare transaction');
      }
    } catch {
      setError('Failed to process welfare transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesFilter = filterType === 'all' || 
      (filterType === 'deposit' && tx.transaction_type === 'welfare_deposit') ||
      (filterType === 'disbursement' && tx.transaction_type === 'welfare_disbursement');
    
    const matchesSearch = !searchQuery ||
      tx.member?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.member?.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.member?.member_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.transaction_ref?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
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
          <h1 className="text-3xl font-bold text-gray-900">Welfare Management</h1>
          <p className="text-gray-500 mt-1">Manage welfare fund deposits and disbursements</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <span>{showForm ? '✕' : '➕'}</span>
          {showForm ? 'Close Form' : 'New Transaction'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              📥
            </div>
            <div>
              <p className="text-green-100 text-sm">Total Deposits</p>
              <p className="text-2xl font-bold">{formatCurrency(summary?.total_deposits || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              📤
            </div>
            <div>
              <p className="text-orange-100 text-sm">Total Disbursements</p>
              <p className="text-2xl font-bold">{formatCurrency(summary?.total_disbursements || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              💰
            </div>
            <div>
              <p className="text-indigo-100 text-sm">Current Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(summary?.balance || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {submitSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center gap-3">
          <span className="text-xl">✅</span>
          Welfare transaction processed successfully!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          {error}
        </div>
      )}

      {/* Transaction Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Welfare Transaction</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member *
                </label>
                <select
                  value={form.member_id}
                  onChange={(e) => setForm({ ...form, member_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select a member</option>
                  {members.filter(m => m.status === 'active').map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name} ({member.member_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction Type *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value="deposit"
                      checked={form.type === 'deposit'}
                      onChange={() => setForm({ ...form, type: 'deposit' })}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Deposit</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value="disbursement"
                      checked={form.type === 'disbursement'}
                      onChange={() => setForm({ ...form, type: 'disbursement' })}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="text-sm">Disbursement</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (KES) *
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={form.reference_number}
                  onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                  placeholder="Optional reference"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Transaction description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !form.member_id || !form.amount}
                className={`px-6 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
                  form.type === 'deposit' 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Processing...
                  </>
                ) : (
                  <>
                    {form.type === 'deposit' ? '📥' : '📤'}
                    {form.type === 'deposit' ? 'Record Deposit' : 'Record Disbursement'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'deposit', 'disbursement'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterType(filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterType === filter
                    ? filter === 'deposit'
                      ? 'bg-green-100 text-green-800'
                      : filter === 'disbursement'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-indigo-100 text-indigo-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'deposit' ? 'Deposits' : 'Disbursements'}
              </button>
            ))}
          </div>
          <div className="w-full md:w-80">
            <input
              type="text"
              placeholder="Search by member name or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Transaction History ({filteredTransactions.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">🛡️</span>
                    <p className="mt-2">No welfare transactions found</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-indigo-600">{tx.transaction_ref}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {tx.member ? `${tx.member.first_name} ${tx.member.last_name}` : 'Unknown'}
                      </div>
                      {tx.member && (
                        <div className="text-xs text-gray-500">{tx.member.member_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        tx.transaction_type === 'welfare_deposit'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {tx.transaction_type === 'welfare_deposit' ? 'Deposit' : 'Disbursement'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-semibold ${
                        tx.transaction_type === 'welfare_deposit' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        {tx.transaction_type === 'welfare_deposit' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 max-w-xs truncate">
                        {tx.description || '-'}
                      </div>
                      {tx.reference_number && (
                        <div className="text-xs text-gray-400">Ref: {tx.reference_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(tx.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
