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

interface Transaction {
  id: string;
  transaction_ref: string;
  member_id: string;
  member_name?: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  reference_number: string | null;
  posted_at: string;
  balance_after: number;
  member?: {
    first_name: string;
    last_name: string;
    member_number: string;
  };
}

interface TransactionForm {
  member_id: string;
  transaction_type: string;
  amount: string;
  description: string;
  reference: string;
  account_type: string;
}

const TRANSACTION_TYPES = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'fee', label: 'Fee' },
  { value: 'fine', label: 'Fine Payment' },
  { value: 'contribution', label: 'Contribution' },
  { value: 'share_purchase', label: 'Share Purchase' },
  { value: 'loan_repayment', label: 'Loan Repayment' },
];

export default function TransactionsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [form, setForm] = useState<TransactionForm>({
    member_id: '',
    transaction_type: 'deposit',
    amount: '',
    description: '',
    reference: '',
    account_type: 'savings',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [membersRes, transactionsRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/transactions'),
      ]);
      const membersData = await membersRes.json();
      const transactionsData = await transactionsRes.json();

      if (membersData.success) setMembers(membersData.data || []);
      if (transactionsData.success) setTransactions(transactionsData.data || []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSelectedMember(null);
      return;
    }
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        setSelectedMember(data.data[0]);
        setForm((prev) => ({ ...prev, member_id: data.data[0].id }));
      } else {
        setSelectedMember(null);
      }
    } catch {
      setError('Search failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.member_id || !form.amount) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: form.member_id,
          account_type: form.account_type,
          transaction_type: form.transaction_type,
          amount: parseFloat(form.amount),
          description: form.description,
          reference_number: form.reference,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setForm({
          member_id: '',
          transaction_type: 'deposit',
          amount: '',
          description: '',
          reference: '',
          account_type: 'savings',
        });
        setSelectedMember(null);
        setSearchQuery('');
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to post transaction');
      }
    } catch {
      setError('Failed to post transaction');
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionColor = (type: string) => {
    const colors: Record<string, string> = {
      deposit: 'text-green-600 bg-green-50',
      withdrawal: 'text-red-600 bg-red-50',
      transfer: 'text-blue-600 bg-blue-50',
      fee: 'text-orange-600 bg-orange-50',
      fine: 'text-red-600 bg-red-50',
      contribution: 'text-purple-600 bg-purple-50',
      share_purchase: 'text-indigo-600 bg-indigo-50',
      loan_repayment: 'text-teal-600 bg-teal-50',
    };
    return colors[type] || 'text-gray-600 bg-gray-50';
  };

  const getTransactionLabel = (type: string) => {
    return TRANSACTION_TYPES.find((t) => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded-lg"></div>
            <div className="h-96 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-500 mt-1">Post and manage financial transactions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction Form */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Post New Transaction</h2>

          {/* Member Search */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Member
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by member number, phone, or name..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Search
              </button>
            </div>
            {selectedMember && (
              <div className="mt-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-indigo-900">
                      {selectedMember.first_name} {selectedMember.last_name}
                    </p>
                    <p className="text-sm text-indigo-600">
                      {selectedMember.member_number} • {selectedMember.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedMember(null);
                      setSearchQuery('');
                      setForm((prev) => ({ ...prev, member_id: '' }));
                    }}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transaction Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {submitSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                Transaction posted successfully!
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction Type *
                </label>
                <select
                  value={form.transaction_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, transaction_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Type *
                </label>
                <select
                  value={form.account_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, account_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="savings">Savings</option>
                  <option value="shares">Shares</option>
                  <option value="contributions">Contributions</option>
                  <option value="welfare">Welfare</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (KES) *
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Transaction description..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Optional reference"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={!form.member_id || !form.amount || submitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Processing...
                </>
              ) : (
                <>
                  <span>💰</span>
                  Post Transaction
                </>
              )}
            </button>
          </form>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
            <span className="text-sm text-gray-500">{transactions.length} transactions</span>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                <span className="text-4xl">📋</span>
                <p className="mt-2">No transactions yet</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTransactionColor(tx.transaction_type)}`}>
                          {getTransactionLabel(tx.transaction_type)}
                        </span>
                        <span className="text-xs text-gray-500">{tx.transaction_ref}</span>
                      </div>
                      <p className="text-sm text-gray-900 mt-1">
                        {tx.member_name || (tx.member ? `${tx.member.first_name} ${tx.member.last_name}` : 'Unknown Member')}
                      </p>
                      {tx.description && (
                        <p className="text-xs text-gray-500 mt-1">{tx.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{formatDate(tx.posted_at)}</p>
                    </div>
                    <div className={`text-right font-semibold ${
                      ['deposit', 'loan_repayment'].includes(tx.transaction_type)
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {['deposit', 'loan_repayment'].includes(tx.transaction_type) ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
