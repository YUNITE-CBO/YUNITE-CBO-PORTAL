'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { TransactionsTable } from '@/components/dashboard/TransactionsTable';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/api/types';

interface SavingsData { balance: number; transactions: Transaction[]; }

export default function SavingsPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<SavingsData>('/api/member/savings', () => router.replace('/#access'));

  if (loading) return <Loading label="Loading your savings…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Savings & Shares" subtitle="Your savings account and derived shares." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Savings balance" value={formatMoney(data?.balance || 0)} accent="green" />
        <StatCard label="Shares" value={String(Math.floor((data?.balance || 0) / 100))} sub="Approx. (1 share per KES 100 saved)" accent="navy" />
        <StatCard label="Transactions" value={String(data?.transactions?.length || 0)} sub="On your savings account" accent="gold" />
      </div>
      <Card className="mt-6">
        <SectionTitle>Recent savings activity</SectionTitle>
        <TransactionsTable rows={data?.transactions || []} emptyTitle="No savings transactions yet" />
      </Card>
    </>
  );
}
