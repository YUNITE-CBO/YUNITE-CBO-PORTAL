'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pill, SectionTitle, StatCard } from '@/components/dashboard/ui';
import { formatDate, formatMoney } from '@/lib/format';
import type { Loan } from '@/lib/api/types';

export default function LoansPage() {
  const router = useRouter();
  const { data, loading, error, reconnecting, reload } = useApi<Loan[]>('/api/member/loans', () => router.replace('/#access'));

  if (reconnecting) return <Loading label="Connecting to YUNITE…" />;
  if (loading) return <Loading label="Loading your loans…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const loans = data || [];
  const outstanding = loans.filter((l) => ['active', 'disbursed', 'approved'].includes(l.status)).reduce((s, l) => s + Number(l.amount_due || 0), 0);
  const totalPaid = loans.reduce((s, l) => s + Number(l.amount_paid || 0), 0);

  return (
    <>
      <PageHeader title="Loans" subtitle="Your loan portfolio and repayment progress." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={formatMoney(outstanding)} accent="red" />
        <StatCard label="Total repaid" value={formatMoney(totalPaid)} accent="green" />
        <StatCard label="Loan count" value={String(loans.length)} accent="navy" />
      </div>

      <div className="mt-6 space-y-4">
        {loans.length === 0 ? (
          <EmptyState title="No loans on your account" body="When you take a loan through YUNITE, it will appear here with full repayment details." icon="🏦" />
        ) : (
          loans.map((l) => {
            const progress = l.total_amount > 0 ? Math.min(100, (Number(l.amount_paid) / Number(l.total_amount)) * 100) : 0;
            return (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{l.loan_number}</h3>
                      <Pill status={l.status} />
                    </div>
                    <div className="mt-0.5 text-sm text-white/50 capitalize">{l.loan_type} loan · {l.repayment_period_months} months</div>
                    {l.purpose && <div className="mt-1 text-sm text-white/70">Purpose: {l.purpose}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/50">Outstanding</div>
                    <div className="text-lg font-bold tabular text-red-300">{formatMoney(l.amount_due)}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Field label="Principal" value={formatMoney(l.principal_amount)} />
                  <Field label="Interest" value={`${formatMoney(l.interest_amount)} (${l.interest_rate}%)`} />
                  <Field label="Monthly" value={formatMoney(l.monthly_repayment)} />
                  <Field label="Repaid" value={formatMoney(l.amount_paid)} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-white/45">
                    <span>Repayment progress</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-green to-brand-green-soft" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/50">
                  <span>Disbursed: {formatDate(l.disbursement_date)}</span>
                  <span>Repay start: {formatDate(l.repayment_start_date)}</span>
                  <span>Repay end: {formatDate(l.repayment_end_date)}</span>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <div className="text-xs text-white/45">{label}</div>
      <div className="font-semibold tabular text-white">{value}</div>
    </div>
  );
}
