import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { loanService } from '@/lib/services/loan.service';

export const POST = createHandler('loans.disburse', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  // Disbursement flows through the Loan Engine, which posts the
  // loan_disbursement transaction through the Transaction Engine.
  const loan = await loanService.disburse(
    ctx.params.id,
    ctx.principal.userId,
    body.disbursement_date ? String(body.disbursement_date) : undefined
  );
  return { data: loan };
});
