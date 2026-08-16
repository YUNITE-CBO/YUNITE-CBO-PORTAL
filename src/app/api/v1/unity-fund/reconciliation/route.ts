import { createHandler } from '@/lib/api/handler';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Reconcile the Unity Fund ledger against independent source recomputation
// and the dashboard path. Detects discrepancies (spec §18, §29, RULE 29).
export const GET = createHandler('unity_fund.reconciliation', async () => {
  const reconciliation = await unityFundEngine.getReconciliation();
  return { data: reconciliation };
});
