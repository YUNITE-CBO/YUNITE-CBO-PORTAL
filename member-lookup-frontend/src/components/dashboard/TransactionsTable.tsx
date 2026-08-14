'use client';

import { formatDate, formatMoney, transactionLabel } from '@/lib/format';
import type { Transaction } from '@/lib/api/types';
import { EmptyState } from './ui';

export function TransactionsTable({ rows, emptyTitle = 'No transactions yet' }: { rows: Transaction[]; emptyTitle?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} body="Transactions will appear here once recorded in your account." icon="🧾" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/40">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Reference</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 text-right font-medium">Balance after</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
              <td className="whitespace-nowrap px-3 py-3 text-white/70">{formatDate(t.posted_at || t.created_at)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-white/60">{t.transaction_ref}</td>
              <td className="px-3 py-3 capitalize text-white/80">{transactionLabel(t.transaction_type)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular text-white">{formatMoney(t.amount)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular text-white/60">{formatMoney(t.balance_after)}</td>
              <td className="px-3 py-3">
                {t.reversed ? <span className="pill status-suspended">Reversed</span> : <span className="pill status-active">Posted</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
