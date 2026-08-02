'use client';

import { useEffect, useState, use } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  status: string;
  registration_date: string;
  occupation: string;
  employer: string;
  physical_address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  next_of_kin_relationship: string;
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
  description: string;
  created_at: string;
}

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<Member | null>(null);
  const [balances, setBalances] = useState<CalculatedBalances | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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

  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      savings_deposit: 'Savings Deposit',
      savings_withdrawal: 'Savings Withdrawal',
      contribution_monthly: 'Monthly Contribution',
      contribution_special: 'Special Contribution',
      welfare_deposit: 'Welfare Contribution',
      fine_payment: 'Fine Payment',
      loan_repayment: 'Loan Repayment',
    };
    return labels[type] || type;
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
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {member.first_name} {member.last_name}
              </h1>
              <p className="text-gray-500">{member.member_number}</p>
            </div>
            <span className={`px-3 py-1 text-sm rounded-full ${
              member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {member.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
              </div>
              <div className="divide-y">
                {transactions.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">No transactions</div>
                ) : (
                  transactions.slice(0, 10).map((txn) => (
                    <div key={txn.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {getTransactionLabel(txn.transaction_type)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {txn.transaction_ref} · {formatDate(txn.created_at)}
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
                <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Post Savings
                </button>
                <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Post Contribution
                </button>
                <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  Issue Fine
                </button>
                <button className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                  Apply for Loan
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
    </div>
  );
}
