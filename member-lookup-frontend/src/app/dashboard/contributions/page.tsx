'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { TransactionsTable } from '@/components/dashboard/TransactionsTable';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/api/types';

interface ContributionsData { balance: number; transactions: Transaction[]; }

export default function ContributionsPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<ContributionsData>('/api/member/contributions', () => router.replace('/#access'));

  if (loading) return <Loading label="Loading your contributions…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Contributions" subtitle="Monthly and special contributions to the organisation." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Contributions balance" value={formatMoney(data?.balance || 0)} accent="green" />
        <StatCard label="Contribution entries" value={String(data?.transactions?.length || 0)} accent="gold" />
      </div>
      <Card className="mt-6">
        <SectionTitle>Contribution history</SectionTitle>
        <TransactionsTable rows={data?.transactions || []} emptyTitle="No contributions recorded yet" />
      </Card>
    </>
  );
}
