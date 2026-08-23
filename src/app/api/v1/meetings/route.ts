import { createHandler } from '@/lib/api/handler';
import { meetingsService } from '@/lib/services/meetings.service';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/meetings — list meetings through the API gateway.
 *
 * Read-only (writes stay on the session-auth /api/meetings routes). Exposed
 * via the `meetings.read` scope so the member-lookup portal's API client can
 * show upcoming meetings on its public home page (closes API_GAPS.md #2).
 * Meeting rows carry no PII beyond optional chairperson/secretary member ids.
 *
 * Query: ?upcoming=true → only scheduled meetings from now onward.
 */
export const GET = createHandler('meetings.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const upcoming = searchParams.get('upcoming') === 'true';
  const data = await meetingsService.list(upcoming);
  return { data };
});
