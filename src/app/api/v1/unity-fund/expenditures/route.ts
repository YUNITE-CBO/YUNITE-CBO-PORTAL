import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// GET authorized Unity Fund expenditures (org outflows).
export const GET = createHandler('unity_fund.expenditures', async () => {
  const expenditures = await unityFundEngine.getExpenditures();
  return { data: expenditures };
});

// POST a new authorized expenditure. Requires a reason + authorization.
// The engine verifies available cash (pending money is not spendable).
export const POST = createHandler('unity_fund.expenditure.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['amount', 'reason']);
  const amount = positiveAmount(body.amount);
  const result = await unityFundEngine.recordExpenditure({
    amount,
    reason: String(body.reason),
    category: body.category ? String(body.category) : undefined,
    reference: body.reference ? String(body.reference) : undefined,
    transaction_date: body.transaction_date ? String(body.transaction_date) : undefined,
    related_project_id: body.related_project_id ? String(body.related_project_id) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    authorized_by: ctx.principal.userId,
    posted_by: ctx.principal.userId,
  });
  return { data: result.expenditure, status: 201 };
});
