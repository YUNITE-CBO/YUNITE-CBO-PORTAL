import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('transactions.get', async (ctx) => {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from('transactions').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw ApiError.server(error.message);
  if (!data) throw ApiError.notFound('Transaction not found');
  return { data };
});
