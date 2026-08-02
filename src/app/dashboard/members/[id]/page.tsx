'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  account_type: string;
  account_number: string;
  balance: number;
  status: string;
}

interface Transaction {
  id: string;
  transaction_ref: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string;
  posted_at: string;
}

interface MemberProfile {
  member: {
    id: string;
    member_number: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string;
    status: string;
    occupation: string | null;
    registration_date: string;
  };
  accounts: Account[];
  recent_transactions: Transaction[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(`/api/members/${id}`);
        const result = await response.json();
        
        if (result.success) {
          setProfile(result.data);
        } else {
          setError(result.error || 'Failed to load member profile');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchProfile();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error || 'Member not found'}
        </div>
        <Link
          href="/dashboard/members"
          className="text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Members
        </Link>
      </div>
    );
  }

  const { member, accounts } = profile;

  const savingsAccount = accounts.find((a) => a.account_type === 'savings');
  const sharesAccount = accounts.find((a) => a.account_type === 'shares');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/members"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Members
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {member.first_name} {member.last_name}
          </h1>
          <p className="text-gray-500">
            Member #{member.member_number} • {member.status}
          </p>
        </div>
        <div className="flex space-x-3">
          <Link
            href={`/dashboard/transactions?member_id=${member.id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Post Transaction
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Member Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Member Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Member Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{member.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{member.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Occupation</p>
                <p className="text-sm font-medium text-gray-900">{member.occupation || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Registration Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(member.registration_date)}
                </p>
              </div>
            </div>
          </div>

          {/* Accounts */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Accounts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500 uppercase">
                      {account.account_type}
                    </span>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        account.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {account.status}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(account.balance)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {account.account_number}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Recent Transactions</h2>
              <Link
                href={`/dashboard/transactions?member_id=${member.id}`}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                View All
              </Link>
            </div>
            <div className="space-y-3">
              {profile.recent_transactions.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No transactions yet</p>
              ) : (
                profile.recent_transactions.slice(0, 5).map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {txn.transaction_type.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(txn.posted_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(txn.amount)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Bal: {formatCurrency(txn.balance_after)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Quick Actions */}
        <div className="space-y-6">
          {/* Loan Eligibility */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Loan Eligibility</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Savings Balance</span>
                <span className="font-medium">
                  {formatCurrency(Number(savingsAccount?.balance || 0))}
                </span>
              </div>
              <Link
                href={`/dashboard/members/${member.id}/loans/apply`}
                className="block w-full text-center px-4 py-2 border border-indigo-600 text-indigo-600 rounded-md hover:bg-indigo-50"
              >
                Apply for Loan
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href={`/dashboard/transactions?member_id=${member.id}&type=deposit`}
                className="block w-full px-4 py-2 text-sm text-left text-gray-700 rounded-md hover:bg-gray-50"
              >
                Post Savings Deposit
              </Link>
              <Link
                href={`/dashboard/transactions?member_id=${member.id}&type=withdrawal`}
                className="block w-full px-4 py-2 text-sm text-left text-gray-700 rounded-md hover:bg-gray-50"
              >
                Post Withdrawal
              </Link>
              <Link
                href={`/dashboard/members/${member.id}/statements`}
                className="block w-full px-4 py-2 text-sm text-left text-gray-700 rounded-md hover:bg-gray-50"
              >
                Generate Statement
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
