'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pill, StatCard } from '@/components/dashboard/ui';
import { formatDate, formatMoney } from '@/lib/format';
import type { Fine } from '@/lib/api/types';

export default function FinesPage() {
  const router = useRouter();
  const { data, loading, error, reconnecting, reload } = useApi<Fine[]>('/api/member/fines', () => router.replace('/#access'));

  if (reconnecting) return <Loading label="Connecting to YUNITE…" />;
  if (loading) return <Loading label="Loading your fines…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const fines = data || [];
  const outstanding = fines.filter((f) => ['pending', 'partial'].includes(f.status)).reduce((s, f) => s + (Number(f.amount) - Number(f.amount_paid)), 0);

  return (
    <>
      <PageHeader title="Fines" subtitle="Outstanding and historical fines on your account." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Outstanding fines" value={formatMoney(outstanding)} accent="red" />
        <StatCard label="Total fine records" value={String(fines.length)} accent="gold" />
      </div>

      <div className="mt-6">
        {fines.length === 0 ? (
          <EmptyState title="No fines on your account" body="Keep attending meetings and paying on time to stay fine-free." icon="✅" />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fines.map((f) => (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-white/60">{f.fine_number}</td>
                      <td className="px-3 py-3 capitalize text-white/80">{f.fine_type}</td>
                      <td className="px-3 py-3 text-white/70">{f.reason}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular text-white">{formatMoney(f.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular text-white/60">{formatMoney(f.amount_paid)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-white/60">{formatDate(f.due_date)}</td>
                      <td className="px-3 py-3"><Pill status={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
