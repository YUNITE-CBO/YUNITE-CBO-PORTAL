import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { welfareService } from '@/lib/services/welfare.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('welfare.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const result = await welfareService.list(searchParams.get('member_id') ?? undefined);
  return { data: result.transactions };
});
