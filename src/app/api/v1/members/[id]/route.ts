import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { memberRegistrationService } from '@/lib/services/member-registration.service';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('members.get', async (ctx) => {
  const workspace = await memberRegistrationService.getWorkspace(ctx.params.id);
  if (!workspace) throw ApiError.notFound('Member not found');
  return { data: workspace };
});

export const PUT = createHandler('members.update', async (ctx) => {
  const supabase = await createServiceClient();
  const { data: existing } = await supabase.from('members').select('id').eq('id', ctx.params.id).maybeSingle();
  if (!existing) throw ApiError.notFound('Member not found');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const allowed = [
    'first_name', 'last_name', 'email', 'phone', 'id_number', 'date_of_birth',
    'gender', 'physical_address', 'postal_address', 'occupation', 'employer',
    'employer_address', 'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_relationship', 'status',
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  if (Object.keys(patch).length === 0) throw ApiError.validation('No updatable fields supplied');

  const { data, error } = await supabase.from('members').update(patch).eq('id', ctx.params.id).select('*').maybeSingle();
  if (error) throw ApiError.server(error.message);
  if (!data) throw ApiError.notFound('Member not found');

  // Best-effort audit (must never fail the update).
  try {
    await supabase.from('audit_logs').insert({
      action: 'members.update',
      record_id: ctx.params.id,
      user_id: ctx.principal.userId ?? null,
      after_value: patch,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[api] audit insert failed:', e instanceof Error ? e.message : e);
  }

  return { data };
});
