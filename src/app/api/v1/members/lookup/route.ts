import { createHandler } from '@/lib/api/handler';
import { memberRegistrationService } from '@/lib/services/member-registration.service';
export const dynamic = 'force-dynamic';

export const GET = createHandler('members.lookup', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const query = searchParams.get('query') ?? searchParams.get('q') ?? '';
  if (!query) {
    return { data: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } };
  }
  const result = await memberRegistrationService.search({ query, page: 1, limit: 10 });
  return { data: result.members, pagination: { page: 1, limit: 10, total: result.total, total_pages: Math.ceil(result.total / 10) || 0 } };
});
