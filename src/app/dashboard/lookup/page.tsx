'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  id_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  physical_address: string | null;
  occupation: string | null;
  employer: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  status: string;
  registration_date: string;
  created_at: string;
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
  posted_at: string;
}

interface Loan {
  id: string;
  loan_number: string;
  loan_type: string;
  principal_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  disbursement_date: string | null;
  monthly_repayment: number;
}

interface Fine {
  id: string;
  fine_number: string;
  fine_type: string;
  amount: number;
  amount_paid: number;
  reason: string;
  status: string;
  due_date: string | null;
}

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  expiry_date: string | null;
}

interface ComplianceRecord {
  id: string;
  compliance_type: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_date: string | null;
}

interface MemberWorkspace {
  member: Member;
  balances: CalculatedBalances;
  transactions: Transaction[];
  loans: Loan[];
  fines: Fine[];
  documents: Document[];
  compliance: ComplianceRecord[];
}

export default function MemberLookupPage() {
  const [searchMemberNumber, setSearchMemberNumber] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [workspace, setWorkspace] = useState<MemberWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'transactions' | 'loans' | 'fines' | 'documents' | 'compliance'>('summary');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchMemberNumber.trim() && !searchPhone.trim()) {
      setError('Please enter Member Number or Phone Number');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const params = new URLSearchParams();
      if (searchMemberNumber.trim()) params.append('member_number', searchMemberNumber.trim());
      if (searchPhone.trim()) params.append('phone', searchPhone.trim());

      const res = await fetch(`/api/members/lookup?${params.toString()}`);
      const data = await res.json();

      if (data.success && data.data) {
        setWorkspace(data.data);
      } else {
        setWorkspace(null);
        setError(data.error || 'Member not found');
      }
    } catch {
      setError('Search failed. Please try again.');
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchMemberNumber('');
    setSearchPhone('');
    setWorkspace(null);
    setSearched(false);
    setError(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
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
      welfare_deposit: 'Welfare Deposit',
      fine_payment: 'Fine Payment',
      loan_repayment: 'Loan Repayment',
      registration_fee: 'Registration Fee',
      annual_fee: 'Annual Fee',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      withdrawn: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
      disbursed: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      partial: 'bg-orange-100 text-orange-800',
      verified: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      complete: 'bg-green-100 text-green-800',
      missing: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Initial search view
  if (!workspace && !loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Member Lookup</h1>
          <p className="text-gray-500 mt-1">Verify member information and financial status</p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-2xl">
                🔍
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Search Member</h2>
                <p className="text-sm text-gray-500">Enter Member Number or Phone Number</p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member Number
                </label>
                <input
                  type="text"
                  value={searchMemberNumber}
                  onChange={(e) => setSearchMemberNumber(e.target.value)}
                  placeholder="e.g., YUN-20260802-0001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-center text-gray-400 text-sm">
                <span className="px-4">OR</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="e.g., 0712345678"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Searching...
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    Search Member
                  </>
                )}
              </button>
            </form>
          </div>

          {!searched && (
            <div className="mt-6 text-center text-gray-500 text-sm">
              <p>This workspace is read-only and used for verification.</p>
              <p>Use this to verify member data before the public portal is built.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-500">Searching for member...</p>
          </div>
        </div>
      </div>
    );
  }

  // No results
  if (!workspace) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-center">
              <div className="text-4xl mb-4">❌</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Member Not Found</h2>
              <p className="text-gray-500 mb-4">{error || 'No member matches your search criteria'}</p>
              <button
                onClick={clearSearch}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                New Search
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { member, balances, transactions, loans, fines, documents, compliance } = workspace;

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
              <p className="text-gray-500">
                {member.member_number} • {member.phone}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {getStatusBadge(member.status)}
              <button
                onClick={clearSearch}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                New Search
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border mb-6">
          <div className="flex border-b overflow-x-auto">
            {[
              { key: 'summary', label: 'Summary', icon: '📊' },
              { key: 'transactions', label: 'Transactions', icon: '💰' },
              { key: 'loans', label: 'Loans', icon: '🏦' },
              { key: 'fines', label: 'Fines', icon: '⚠️' },
              { key: 'documents', label: 'Documents', icon: '📄' },
              { key: 'compliance', label: 'Compliance', icon: '✅' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Personal Information */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
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
                    <dt className="text-sm text-gray-500">Date of Birth</dt>
                    <dd className="text-sm font-medium text-gray-900">{formatDate(member.date_of_birth || '')}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Gender</dt>
                    <dd className="text-sm font-medium text-gray-900 capitalize">{member.gender || '-'}</dd>
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

                <div className="border-t mt-6 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Next of Kin</h3>
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
              </div>

              {/* Financial Summary */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">Savings</span>
                    <span className="font-bold text-green-600">{formatCurrency(balances.savings)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">Shares</span>
                    <span className="font-bold text-purple-600">{balances.shares.toLocaleString()} units</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">Contributions</span>
                    <span className="font-bold text-teal-600">{formatCurrency(balances.contributions)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">Welfare</span>
                    <span className="font-bold text-indigo-600">{formatCurrency(balances.welfare)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">Outstanding Fines</span>
                    <span className="font-bold text-red-600">{formatCurrency(balances.fines)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-gray-600">Loan Balance</span>
                    <span className="font-bold text-orange-600">{formatCurrency(balances.loans)}</span>
                  </div>
                </div>

                <div className="border-t mt-6 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Membership</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm text-gray-500">Member Since</dt>
                      <dd className="text-sm font-medium text-gray-900">{formatDate(member.registration_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Status</dt>
                      <dd className="text-sm font-medium">{getStatusBadge(member.status)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
                <span className="text-sm text-gray-500">{transactions.length} transactions</span>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">📋</span>
                    <p className="mt-2">No transactions found</p>
                  </div>
                ) : (
                  transactions.map((txn) => (
                    <div key={txn.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {getTransactionLabel(txn.transaction_type)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {txn.transaction_ref} • {formatDateTime(txn.created_at)}
                        </div>
                        {txn.description && (
                          <div className="text-xs text-gray-400 mt-1">{txn.description}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">{formatCurrency(txn.amount)}</div>
                        <div className="text-sm text-gray-500">
                          Balance: {formatCurrency(txn.balance_after)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Loans Tab */}
          {activeTab === 'loans' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Loan History</h2>
                <span className="text-sm text-gray-500">{loans.length} loans</span>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {loans.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">🏦</span>
                    <p className="mt-2">No loans found</p>
                  </div>
                ) : (
                  loans.map((loan) => (
                    <div key={loan.id} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">
                          {loan.loan_type} - {loan.loan_number}
                        </div>
                        {getStatusBadge(loan.status)}
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Principal</span>
                          <p className="font-medium">{formatCurrency(loan.principal_amount)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Amount Due</span>
                          <p className="font-medium">{formatCurrency(loan.amount_due)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Amount Paid</span>
                          <p className="font-medium text-green-600">{formatCurrency(loan.amount_paid)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Monthly</span>
                          <p className="font-medium">{formatCurrency(loan.monthly_repayment)}</p>
                        </div>
                      </div>
                      {loan.disbursement_date && (
                        <div className="text-xs text-gray-400 mt-2">
                          Disbursed: {formatDate(loan.disbursement_date)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Fines Tab */}
          {activeTab === 'fines' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Fines</h2>
                <span className="text-sm text-gray-500">{fines.length} fines</span>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {fines.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">✅</span>
                    <p className="mt-2">No fines found</p>
                  </div>
                ) : (
                  fines.map((fine) => (
                    <div key={fine.id} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">
                          {fine.fine_type.replace('_', ' ')} - {fine.fine_number}
                        </div>
                        {getStatusBadge(fine.status)}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">{fine.reason}</div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Amount</span>
                          <p className="font-medium">{formatCurrency(fine.amount)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Paid</span>
                          <p className="font-medium text-green-600">{formatCurrency(fine.amount_paid)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Outstanding</span>
                          <p className="font-medium text-red-600">{formatCurrency(fine.amount - fine.amount_paid)}</p>
                        </div>
                      </div>
                      {fine.due_date && (
                        <div className="text-xs text-gray-400 mt-2">
                          Due: {formatDate(fine.due_date)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                <span className="text-sm text-gray-500">{documents.length} documents</span>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {documents.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">📄</span>
                    <p className="mt-2">No documents uploaded</p>
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 capitalize">
                          {doc.document_type.replace('_', ' ')}
                        </div>
                        <div className="text-sm text-gray-500">{doc.file_name}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        {doc.expiry_date && (
                          <div className="text-sm text-gray-500">
                            Expires: {formatDate(doc.expiry_date)}
                          </div>
                        )}
                        {getStatusBadge(doc.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Compliance Records</h2>
                <span className="text-sm text-gray-500">{compliance.length} records</span>
              </div>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {compliance.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">📋</span>
                    <p className="mt-2">No compliance records</p>
                  </div>
                ) : (
                  compliance.map((record) => (
                    <div key={record.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 capitalize">
                          {record.compliance_type.replace('_', ' ')}
                        </div>
                        {record.description && (
                          <div className="text-sm text-gray-500">{record.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        {record.due_date && (
                          <div className="text-sm text-gray-500">
                            Due: {formatDate(record.due_date)}
                          </div>
                        )}
                        {getStatusBadge(record.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
