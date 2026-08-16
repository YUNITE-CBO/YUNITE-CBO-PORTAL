import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Record a grant received into the Unity Fund. An approval is NOT cash; the
// received_amount becomes actual cash (RULE 11-12).
export const POST = createHandler('unity_fund.grant.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['grantor_name', 'received_amount']);
  const received_amount = positiveAmount(body.received_amount, 'received_amount');
  const result = await unityFundEngine.recordGrant({
    grantor_name: String(body.grantor_name),
    purpose: body.purpose ? String(body.purpose) : undefined,
    approved_amount: body.approved_amount != null ? Number(body.approved_amount) : undefined,
    received_amount,
    reference: body.reference ? String(body.reference) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    recorded_by: ctx.principal.userId,
  });
  return { data: result.grant, status: 201 };
});
