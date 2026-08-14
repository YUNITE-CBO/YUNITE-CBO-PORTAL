'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { TransactionsTable } from '@/components/dashboard/TransactionsTable';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/api/types';

interface WelfareData { balance: number; transactions: Transaction[]; }

export default function WelfarePage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<WelfareData>('/api/member/welfare', () => router.replace('/#access'));

  if (loading) return <Loading label="Loading your welfare fund…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Welfare Fund" subtitle="Your welfare contributions — a safety net for every member." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Welfare balance" value={formatMoney(data?.balance || 0)} accent="green" />
        <StatCard label="Welfare entries" value={String(data?.transactions?.length || 0)} accent="gold" />
      </div>
      <Card className="mt-6">
        <SectionTitle>Welfare history</SectionTitle>
        <TransactionsTable rows={data?.transactions || []} emptyTitle="No welfare transactions yet" />
      </Card>
    </>
  );
}
