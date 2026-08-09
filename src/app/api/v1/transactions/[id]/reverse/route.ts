import { createHandler, requireFields } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { transactionEngine } from '@/lib/services/transaction.engine';

export const POST = createHandler('transactions.reverse', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['reason']);
  // Reversal flows through the authoritative Transaction Engine, which
  // creates a paired reversal transaction, soft-marks the original, and
  // re-syncs loan/fine/contribution side effects — preserving the audit trail.
  const result = await transactionEngine.reverse(ctx.params.id, ctx.principal.userId, String(body.reason));
  return { data: result };
});
