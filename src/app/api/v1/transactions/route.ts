import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { transactionEngine, type AccountType, type TransactionType } from '@/lib/services/transaction.engine';

export const GET = createHandler('transactions.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const member_id = searchParams.get('member_id');
  if (!member_id) throw ApiError.validation('member_id query parameter is required');

  const result = await transactionEngine.getHistory({
    member_id,
    account_type: (searchParams.get('account_type') as AccountType) ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
    page: Number(searchParams.get('page') ?? 1),
    limit: Number(searchParams.get('limit') ?? 50),
  });
  return {
    data: result.transactions,
    pagination: { page: result.page, limit: result.limit, total: result.total, total_pages: result.totalPages },
  };
});

export const POST = createHandler('transactions.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'account_type', 'transaction_type', 'amount']);
  const amount = positiveAmount(body.amount);

  const txn = await transactionEngine.execute({
    member_id: String(body.member_id),
    account_type: String(body.account_type) as AccountType,
    transaction_type: String(body.transaction_type) as TransactionType,
    amount,
    description: body.description ? String(body.description) : undefined,
    reference_number: body.reference_number ? String(body.reference_number) : undefined,
    metadata: (body.metadata as Record<string, unknown>) ?? undefined,
    user_id: ctx.principal.userId,
  });
  return { data: txn, status: 201 };
});
