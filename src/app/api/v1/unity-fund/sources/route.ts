import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Receipts breakdown by source (actual + pending). The sum of `actual`
// across sources reconciles exactly to the actual balance.
export const GET = createHandler('unity_fund.sources', async () => {
  const sources = await unityFundEngine.getSourceBreakdown();
  return { data: sources };
});
