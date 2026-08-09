import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('compliance.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const memberId = searchParams.get('member_id') ?? searchParams.get('memberId');

  const supabase = await createServiceClient();
  // Read from the authoritative compliance_records table.
  let q = supabase.from('compliance_records').select('*');
  if (memberId) q = q.eq('member_id', memberId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw ApiError.server(error.message);
  return { data: data ?? [] };
});
