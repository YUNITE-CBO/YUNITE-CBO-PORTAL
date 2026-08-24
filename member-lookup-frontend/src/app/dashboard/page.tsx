'use client';

import { useApi } from '@/components/dashboard/useApi';
import { useRouter } from 'next/navigation';
import { BalanceRow, Card, ErrorState, Loading, PageHeader, Pill, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { BankAccountCard } from '@/components/BankAccountCard';
import { formatMoney } from '@/lib/format';
import type { Member, MemberBalances } from '@/lib/api/types';

interface OverviewData {
  member: Member | null;
  balances: { member_id: string; balances: MemberBalances['balances'] } | { member_id: string; balances: Record<string, number> };
}

export default function OverviewPage() {
  const router = useRouter();
  const { data, loading, error, reconnecting, reload } = useApi<OverviewData>('/api/member/overview', () => router.replace('/#access'));

  if (reconnecting) return <Loading label="Connecting to YUNITE…" />;
  if (loading) return <Loading label="Loading your account…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const m = data.member;
  const b = ('balances' in data.balances ? data.balances.balances : (data.balances as { balances: Record<string, number> }).balances) as Record<string, number>;
  const savings = b.savings || 0;
  const shares = b.shares || 0;
  const loans = b.loans || 0;
  // Member NET POSITION excludes contributions AND welfare. Business rule:
  // contributions and welfare are member contributions INTO the Unity Fund
  // (organization money), not the member's own net worth. Only savings
  // (member's money) minus outstanding loans is the member's net position.
  const netWorth = savings - loans;

  return (
    <>
      <PageHeader
        title={`Karibu, ${m?.first_name || 'Member'} 👋`}
        subtitle={`Member #${m?.member_number || '—'}`}
        action={m ? <Pill status={m.status} /> : null}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total savings" value={formatMoney(savings)} sub="From your deposits" accent="green" />
        <StatCard label="Shares" value={String(shares)} sub="Derived from savings" accent="navy" />
        <StatCard label="Loan balance" value={formatMoney(loans)} sub="Outstanding" accent="red" />
        <StatCard label="Net position" value={formatMoney(netWorth)} sub="Savings − loans" accent="gold" />
      </div>

      <div className="mt-6">
        <BankAccountCard compact />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Account balances</SectionTitle>
          <div className="space-y-2.5">
            <BalanceRow label="Savings" amount={savings} />
            <BalanceRow label="Contributions" amount={b.contributions || 0} />
            <BalanceRow label="Welfare fund" amount={b.welfare || 0} />
            <BalanceRow label="Fines outstanding" amount={b.fines || 0} />
            <BalanceRow label="Loans outstanding" amount={loans} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Membership status</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Member number" v={m?.member_number || '—'} />
            <Row k="Name" v={m ? `${m.first_name} ${m.last_name}` : '—'} />
            <Row k="Status" v={m?.status ? <Pill status={m.status} /> : '—'} />
            <Row k="Registered" v={m?.registration_date ? formatDate(m.registration_date) : '—'} />
            <Row k="Contact" v={m?.phone || '—'} />
            <Row k="Email" v={m?.email || '—'} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/dashboard/savings" className="btn-primary !py-2.5 text-sm">View savings</a>
            <a href="/dashboard/statement" className="btn-ghost !py-2.5 text-sm">Get statement</a>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-white/50">{k}</dt>
      <dd className="font-medium text-white">{v}</dd>
    </div>
  );
}
function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; }
}
