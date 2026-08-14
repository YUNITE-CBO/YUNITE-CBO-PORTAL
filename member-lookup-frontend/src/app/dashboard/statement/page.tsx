'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { TransactionsTable } from '@/components/dashboard/TransactionsTable';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/api/types';

interface StatementData {
  balances?: Record<string, number>;
  transactions?: Transaction[];
  note?: string;
}

interface StatementResponse {
  available?: boolean;
  data?: StatementData;
  note?: string;
}

export default function StatementPage() {
  const router = useRouter();
  const { data, loading, error, reconnecting, reload } = useApi<StatementResponse>('/api/member/statement', () => router.replace('/#access'));

  if (reconnecting) return <Loading label="Connecting to YUNITE…" />;
  if (loading) return <Loading label="Preparing your statement…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const available = data?.available;
  const s = data?.data;
  const balances = s?.balances || {};
  const transactions = s?.transactions || [];

  return (
    <>
      <PageHeader title="Statement of Account" subtitle="A summary of your position and activity." />

      {!available && (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {s?.note || data?.note || 'The official statement service is temporarily unavailable. Balances and recent transactions below are accurate.'}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Savings" value={formatMoney(balances.savings || 0)} accent="green" />
        <StatCard label="Contributions" value={formatMoney(balances.contributions || 0)} accent="navy" />
        <StatCard label="Loans outstanding" value={formatMoney(balances.loans || 0)} accent="red" />
      </div>

      <Card className="mt-6">
        <SectionTitle>Recent activity</SectionTitle>
        <TransactionsTable rows={transactions} emptyTitle="No transactions to show" />
      </Card>

      <p className="mt-4 text-xs text-white/40">
        Balances and transactions are sourced live from YUNITE. For an official, certified PDF statement, please contact the YUNITE office.
      </p>
    </>
  );
}
