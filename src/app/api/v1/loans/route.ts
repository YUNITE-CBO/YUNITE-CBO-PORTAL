import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { loanService } from '@/lib/services/loan.service';
import { createServiceClient } from '@/lib/supabase/server';

export const GET = createHandler('loans.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const status = searchParams.get('status');
  const memberId = searchParams.get('member_id');

  let loans;
  if (status) loans = await loanService.getByStatus(status);
  else if (memberId) loans = await loanService.getByMember(memberId);
  else loans = await loanService.getAll();
  return { data: loans };
});

export const POST = createHandler('loans.apply', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['member_id', 'loan_type', 'principal_amount']);
  const principal = positiveAmount(body.principal_amount);

  // Loan application goes through the authoritative Loan Engine, which
  // checks eligibility, calculates interest, and emits the audit + event.
  const loan = await loanService.apply({
    member_id: String(body.member_id),
    loan_type: String(body.loan_type),
    principal_amount: principal,
    repayment_period_months: body.repayment_period_months ? Number(body.repayment_period_months) : undefined,
    purpose: body.purpose ? String(body.purpose) : undefined,
    user_id: ctx.principal.userId,
  });
  return { data: loan, status: 201 };
});
