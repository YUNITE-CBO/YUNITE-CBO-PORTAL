import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Organization loan liabilities. A received org loan is cash AND a liability —
// never income (RULE 13-14).
export const GET = createHandler('unity_fund.liabilities', async () => {
  const liabilities = await unityFundEngine.getLiabilities();
  return { data: liabilities };
});
