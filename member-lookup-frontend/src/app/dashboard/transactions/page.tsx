'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader } from '@/components/dashboard/ui';
import { TransactionsTable } from '@/components/dashboard/TransactionsTable';
import type { Transaction } from '@/lib/api/types';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'savings', label: 'Savings' },
  { key: 'contributions', label: 'Contributions' },
  { key: 'welfare', label: 'Welfare' },
  { key: 'fines', label: 'Fines' },
  { key: 'loans', label: 'Loans' },
];

export default function TransactionsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const url = `/api/member/transactions${filter ? `?account_type=${filter}` : ''}`;
  const { data, loading, error, reload } = useApi<Transaction[]>(url, () => router.replace('/#access'));

  return (
    <>
      <PageHeader title="Transactions" subtitle="Your complete transaction ledger." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter === f.key ? 'bg-brand-green/20 text-brand-green-soft ring-1 ring-brand-green/30' : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? <Loading label="Loading transactions…" />
          : error ? <ErrorState message={error} onRetry={reload} />
          : <TransactionsTable rows={data || []} emptyTitle="No transactions for this filter" />}
      </Card>
    </>
  );
}
