import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Actual Unity Fund cash balance (real money the organization has).
// Pending receivables are NOT included — see /unity-fund/pending.
export const GET = createHandler('unity_fund.balance', async () => {
  const balance = await unityFundEngine.getActualBalance();
  return { data: { actual_balance: balance, currency: 'KES' } };
});
