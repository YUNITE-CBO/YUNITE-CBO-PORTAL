import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { createServiceClient } from '@/lib/supabase/server';

export const PUT = createHandler('compliance.update', async (ctx) => {
  const supabase = await createServiceClient();
  const { data: existing } = await supabase
    .from('compliance_records')
    .select('id')
    .eq('member_id', ctx.params.memberId)
    .maybeSingle();
  if (!existing) throw ApiError.notFound('Compliance record not found for member');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const allowed = ['status', 'compliance_type', 'verified_by', 'verified_at', 'expiry_date', 'notes'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  if (Object.keys(patch).length === 0) throw ApiError.validation('No updatable fields supplied');

  const { data, error } = await supabase
    .from('compliance_records')
    .update(patch)
    .eq('member_id', ctx.params.memberId)
    .select('*')
    .maybeSingle();
  if (error) throw ApiError.server(error.message);
  if (!data) throw ApiError.notFound('Compliance record not found for member');

  try {
    await supabase.from('audit_logs').insert({
      action: 'compliance.update',
      record_id: ctx.params.memberId,
      user_id: ctx.principal.userId ?? null,
      after_value: patch,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[api] compliance audit failed:', e instanceof Error ? e.message : e);
  }

  return { data };
});
