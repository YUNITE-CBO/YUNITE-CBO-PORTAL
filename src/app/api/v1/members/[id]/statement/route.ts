import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { statementService, type StatementType } from '@/lib/services/notifications/statement.service';

export const GET = createHandler('statements.member', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const periodStart = searchParams.get('period_start');
  const periodEnd = searchParams.get('period_end');
  const statementType = (searchParams.get('type') as StatementType) ?? 'savings';

  // Generate a member statement through the authoritative Statement Service.
  const statement = await statementService.generate({
    statement_type: statementType,
    period_start: periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    period_end: periodEnd ? new Date(periodEnd) : new Date(),
    recipient_type: 'member',
    recipient_id: ctx.params.id,
  });
  return { data: statement };
});
