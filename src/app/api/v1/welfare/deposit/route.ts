import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { welfareService } from '@/lib/services/welfare.service';

export const POST = createHandler('welfare.deposit', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'amount']);
  const amount = positiveAmount(body.amount);
  // Ledger movement delegated to the authoritative Transaction Engine.
  const result = await welfareService.record(
    {
      member_id: String(body.member_id),
      amount,
      description: body.description ? String(body.description) : undefined,
      reference_number: body.reference_number ? String(body.reference_number) : undefined,
      type: body.type === 'disbursement' ? 'disbursement' : 'deposit',
    },
    ctx.principal.userId
  );
  return { data: result, status: 201 };
});
