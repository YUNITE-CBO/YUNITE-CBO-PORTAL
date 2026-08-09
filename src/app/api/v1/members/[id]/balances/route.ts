import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { transactionEngine } from '@/lib/services/transaction.engine';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('transactions.balances', async (ctx) => {
  const supabase = await createServiceClient();
  const { data: member } = await supabase.from('members').select('id').eq('id', ctx.params.id).maybeSingle();
  if (!member) throw ApiError.notFound('Member not found');

  const balances = await transactionEngine.calculateAllBalances(ctx.params.id);
  return { data: { member_id: ctx.params.id, balances } };
});
