import { createHandler, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { loanService } from '@/lib/services/loan.service';

export const POST = createHandler('loans.repay', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const amount = positiveAmount(body.amount, 'amount');
  // Repayment flows through the Loan Engine, which posts a loan_repayment
  // transaction through the Transaction Engine and reduces amount_due.
  const loan = await loanService.repay(ctx.params.id, ctx.principal.userId, amount);
  return { data: loan };
});
