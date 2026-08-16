import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Full Unity Fund financial position: actual vs pending, sources, liabilities.
export const GET = createHandler('unity_fund.summary', async () => {
  const position = await unityFundEngine.getFinancialPosition();
  return { data: position };
});
