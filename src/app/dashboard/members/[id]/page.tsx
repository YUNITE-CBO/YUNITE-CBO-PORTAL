'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  id_number: string | null;
  status: string;
  registration_date: string;
  occupation: string | null;
  employer: string | null;
  physical_address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
}

interface CalculatedBalances {
  savings: number;
  shares: number;
  contributions: number;
  welfare: number;
  fines: number;
  loans: number;
}

interface Transaction {
  id: string;
  transaction_ref: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  reversed: boolean;
}

type ActionModal = 'savings_deposit' | 'savings_withdrawal' | 'contribution' | 'fine' | null;

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<Member | null>(null);
  const [balances, setBalances] = useState<CalculatedBalances | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    reference: '',
    fineType: 'meeting_absence',
    reason: '',
  });

  useEffect(() => {
    if (id) {
      fetchMember();
    }
  }, [id]);

  const fetchMember = async () => {
    try {
      const res = await fetch(`/api/members/${id}`);
      const data = await res.json();
      if (data.success) {
        setMember(data.data.member);
        setBalances(data.data.balances);
        setTransactions(data.data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch member:', err);
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
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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

  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      savings_deposit: 'Savings Deposit',
      savings_withdrawal: 'Savings Withdrawal',
      savings_adjustment: 'Savings Adjustment',
      contribution_monthly: 'Monthly Contribution',
      contribution_special: 'Special Contribution',
      contribution_development: 'Development Contribution',
      welfare_deposit: 'Welfare Contribution',
      fine_payment: 'Fine Payment',
      loan_repayment: 'Loan Repayment',
      registration_fee: 'Registration Fee',
      annual_fee: 'Annual Fee',
      reversal: 'Transaction Reversal',
    };
    return labels[type] || type;
  };

  const handlePostTransaction = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const transactionType = actionModal === 'savings_deposit' ? 'deposit' : 'withdrawal';
      const accountType = actionModal === 'contribution' ? 'contributions' : 'savings';

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          account_type: accountType,
          transaction_type: transactionType,
          amount: parseFloat(formData.amount),
          description: formData.description,
          reference_number: formData.reference,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: `${actionModal === 'savings_deposit' ? 'Deposit' : 'Withdrawal'} posted successfully!` });
        setActionModal(null);
        setFormData({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        setMessage({ type: 'error', text: data.error || 'Transaction failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Transaction failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostContribution = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          account_type: 'contributions',
          transaction_type: 'contribution',
          amount: parseFloat(formData.amount),
          description: formData.description || 'Monthly contribution',
          reference_number: formData.reference,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Contribution posted successfully!' });
        setActionModal(null);
        setFormData({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        setMessage({ type: 'error', text: data.error || 'Transaction failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Transaction failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueFine = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0 || !formData.reason) {
      setMessage({ type: 'error', text: 'Please enter amount and reason' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          fine_type: formData.fineType,
          amount: parseFloat(formData.amount),
          reason: formData.reason,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Fine issued successfully!' });
        setActionModal(null);
        setFormData({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to issue fine' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to issue fine' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">Member not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {member.first_name} {member.last_name}
              </h1>
              <p className="text-gray-500">{member.member_number}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/lookup" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                ← Back to Lookup
              </Link>
              <span className={`px-3 py-1 text-sm rounded-full ${
                member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {member.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Member Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.email || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.phone}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">ID Number</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.id_number || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Occupation</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.occupation || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Employer</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.employer || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Address</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.physical_address || '-'}</dd>
                </div>
              </dl>
            </div>

            {/* Next of Kin */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Next of Kin</h2>
              <dl className="grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">Name</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.next_of_kin_name || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.next_of_kin_phone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Relationship</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.next_of_kin_relationship || '-'}</dd>
                </div>
              </dl>
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
                <Link href={`/dashboard/transactions?member_id=${member.id}`} className="text-sm text-indigo-600 hover:text-indigo-700">
                  View all →
                </Link>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">No transactions</div>
                ) : (
                  transactions.slice(0, 10).map((txn) => (
                    <div key={txn.id} className={`px-6 py-4 flex items-center justify-between ${txn.reversed ? 'opacity-50' : ''}`}>
                      <div>
                        <div className="font-medium text-gray-900">
                          {getTransactionLabel(txn.transaction_type)}
                          {txn.reversed && <span className="ml-2 text-xs text-red-600">(Reversed)</span>}
                        </div>
                        <div className="text-sm text-gray-500">
                          {txn.transaction_ref} · {formatDateTime(txn.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">{formatCurrency(txn.amount)}</div>
                        <div className="text-sm text-gray-500">
                          Balance: {formatCurrency(txn.balance_after)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Balances */}
          <div className="space-y-6">
            {/* Financial Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Savings</span>
                  <span className="font-bold text-green-600">{formatCurrency(balances?.savings || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Shares</span>
                  <span className="font-bold text-purple-600">{balances?.shares || 0} units</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Contributions</span>
                  <span className="font-bold text-teal-600">{formatCurrency(balances?.contributions || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Welfare</span>
                  <span className="font-bold text-indigo-600">{formatCurrency(balances?.welfare || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Outstanding Fines</span>
                  <span className="font-bold text-red-600">{formatCurrency(balances?.fines || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Loan Balance</span>
                  <span className="font-bold text-orange-600">{formatCurrency(balances?.loans || 0)}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button 
                  onClick={() => setActionModal('savings_deposit')}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  Post Savings Deposit
                </button>
                <button 
                  onClick={() => setActionModal('savings_withdrawal')}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Post Savings Withdrawal
                </button>
                <button 
                  onClick={() => setActionModal('contribution')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Post Contribution
                </button>
                <button 
                  onClick={() => setActionModal('fine')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Issue Fine
                </button>
              </div>
            </div>

            {/* Member Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Member Details</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Member Number</dt>
                  <dd className="text-sm font-medium text-gray-900">{member.member_number}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Registration Date</dt>
                  <dd className="text-sm font-medium text-gray-900">{formatDate(member.registration_date)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Status</dt>
                  <dd className="text-sm font-medium text-gray-900 capitalize">{member.status}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {actionModal === 'savings_deposit' && 'Post Savings Deposit'}
                {actionModal === 'savings_withdrawal' && 'Post Savings Withdrawal'}
                {actionModal === 'contribution' && 'Post Contribution'}
                {actionModal === 'fine' && 'Issue Fine'}
              </h3>
              <button 
                onClick={() => { setActionModal(null); setFormData({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {actionModal === 'fine' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fine Type *</label>
                    <select
                      value={formData.fineType}
                      onChange={(e) => setFormData({ ...formData, fineType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="meeting_absence">Meeting Absence</option>
                      <option value="late_payment">Late Payment</option>
                      <option value="penalty">Penalty</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Enter reason for fine..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      placeholder="Optional reference..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setActionModal(null); setFormData({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={
                  actionModal === 'savings_deposit' || actionModal === 'savings_withdrawal'
                    ? handlePostTransaction
                    : actionModal === 'contribution'
                    ? handlePostContribution
                    : handleIssueFine
                }
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
