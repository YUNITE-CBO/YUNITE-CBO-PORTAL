import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { loanService } from '@/lib/services/loan.service';

export const POST = createHandler('loans.approve', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const loan = await loanService.approve(
    ctx.params.id,
    ctx.principal.userId,
    body.disbursement_date ? String(body.disbursement_date) : undefined
  );
  return { data: loan };
});
