import { createHandler } from '@/lib/api/handler';
import { loanService } from '@/lib/services/loan.service';

export const GET = createHandler('loans.eligibility', async (ctx) => {
  const eligibility = await loanService.calculateEligibility(ctx.params.memberId);
  return { data: { member_id: ctx.params.memberId, ...eligibility } };
});
