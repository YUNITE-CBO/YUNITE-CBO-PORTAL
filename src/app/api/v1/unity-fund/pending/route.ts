import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Pending receivables — money expected/due but NOT yet received.
// These are never added to the actual cash balance (RULE 1-2).
export const GET = createHandler('unity_fund.pending', async () => {
  const [sources, total] = await Promise.all([
    unityFundEngine.getSourceBreakdown(),
    unityFundEngine.getPendingReceivables(),
  ]);
  const pending_sources = sources
    .filter((s) => s.pending > 0)
    .map((s) => ({ source: s.source, label: s.label, pending: s.pending }));
  return { data: { total_pending: total, pending_sources } };
});
