import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Record a donation received into the Unity Fund. A pledge is pending; the
// received_amount becomes actual cash (RULE 9-10).
export const POST = createHandler('unity_fund.donation.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['donor_name', 'received_amount']);
  const received_amount = positiveAmount(body.received_amount, 'received_amount');
  const result = await unityFundEngine.recordDonation({
    donor_name: String(body.donor_name),
    donor_contact: body.donor_contact ? String(body.donor_contact) : undefined,
    purpose: body.purpose ? String(body.purpose) : undefined,
    pledged_amount: body.pledged_amount != null ? Number(body.pledged_amount) : undefined,
    received_amount,
    reference: body.reference ? String(body.reference) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    recorded_by: ctx.principal.userId,
  });
  return { data: result.donation, status: 201 };
});
