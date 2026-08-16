import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { unityFundEngine } from '@/lib/services/unity-fund.engine';

export const dynamic = 'force-dynamic';

// Record an organization loan received. This increases actual Unity Fund
// cash AND creates an organization liability. It is NEVER income (RULE 13-14).
export const POST = createHandler('unity_fund.org_loan.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['lender_name', 'principal_amount']);
  const principal_amount = positiveAmount(body.principal_amount, 'principal_amount');
  const result = await unityFundEngine.recordOrganizationLoan({
    lender_name: String(body.lender_name),
    principal_amount,
    interest_rate: body.interest_rate != null ? Number(body.interest_rate) : undefined,
    reference: body.reference ? String(body.reference) : undefined,
    purpose: body.purpose ? String(body.purpose) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    recorded_by: ctx.principal.userId,
  });
  return { data: result.organization_loan, status: 201 };
});
