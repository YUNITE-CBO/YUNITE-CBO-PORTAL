import { createHandler } from '@/lib/api/handler';
import { unityFundEngine, type UnityFundSource, type PaymentStatus } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Unified Unity Fund transaction history across all sources (actual + pending).
export const GET = createHandler('unity_fund.transactions', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const source = searchParams.get('source') as UnityFundSource | null;
  const payment_status = searchParams.get('payment_status') as PaymentStatus | null;
  const start_date = searchParams.get('start_date') ?? undefined;
  const end_date = searchParams.get('end_date') ?? undefined;
  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

  const result = await unityFundEngine.getTransactionHistory({
    source: source ?? undefined,
    payment_status: payment_status ?? undefined,
    start_date,
    end_date,
    page,
    limit,
  });
  return { data: result.transactions, pagination: { page: result.page, limit: result.limit, total: result.total, total_pages: result.total_pages } };
});
