import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { contributionService } from '@/lib/services/contribution.service';
import type { TransactionType } from '@/lib/services/transaction.engine';

export const GET = createHandler('contributions.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const data = await contributionService.listContributions(searchParams.get('campaign_id') ?? undefined);
  return { data };
});

export const POST = createHandler('contributions.pay', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'campaign_id', 'amount']);
  const amount = positiveAmount(body.amount);
  const result = await contributionService.recordContribution(
    {
      member_id: String(body.member_id),
      campaign_id: String(body.campaign_id),
      amount,
      payment_date: body.payment_date ? String(body.payment_date) : undefined,
      payment_method: body.payment_method ? String(body.payment_method) : undefined,
      reference: body.reference ? String(body.reference) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      contribution_type: body.contribution_type as TransactionType | undefined,
    },
    ctx.principal.userId
  );
  return { data: result, status: 201 };
});
