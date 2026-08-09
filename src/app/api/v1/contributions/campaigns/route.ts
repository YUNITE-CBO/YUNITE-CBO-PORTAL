import { createHandler, requireFields, positiveAmount } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { contributionService } from '@/lib/services/contribution.service';

export const GET = createHandler('contributions.campaigns.list', async () => {
  const data = await contributionService.listCampaigns();
  return { data };
});

export const POST = createHandler('contributions.campaigns.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const body = requireFields<Record<string, unknown>>(ctx.body, ['campaign_name', 'start_date']);
  const campaign = await contributionService.createCampaign(
    {
      campaign_name: String(body.campaign_name),
      description: body.description ? String(body.description) : undefined,
      target_amount: body.target_amount ? Number(body.target_amount) : undefined,
      start_date: String(body.start_date),
      end_date: body.end_date ? String(body.end_date) : undefined,
    },
    ctx.principal.userId
  );
  return { data: campaign, status: 201 };
});
