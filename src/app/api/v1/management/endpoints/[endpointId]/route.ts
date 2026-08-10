import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { apiManagementService } from '@/lib/api/management.service';
import { endpointById } from '@/lib/api/manifest';

/**
 * Toggle an endpoint on/off, or override its per-minute rate limit, without
 * a code change. The manifest remains the source of truth for metadata;
 * this only overrides runtime behaviour via api_endpoint_overrides.
 */
export const PUT = createHandler('api.endpoints.update', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const endpointId = ctx.params.endpointId;
  const spec = endpointById(endpointId);
  if (!spec) throw ApiError.notFound('Unknown endpoint id');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const is_active = body.is_active;
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    throw ApiError.validation('is_active must be a boolean');
  }
  let rate_limit_per_minute: number | null = null;
  if (body.rate_limit_per_minute !== undefined && body.rate_limit_per_minute !== null) {
    rate_limit_per_minute = Number(body.rate_limit_per_minute);
    if (!Number.isFinite(rate_limit_per_minute) || rate_limit_per_minute <= 0) {
      throw ApiError.validation('rate_limit_per_minute must be a positive number');
    }
  } else if (body.rate_limit_per_minute === null) {
    rate_limit_per_minute = null;
  }

  await apiManagementService.setEndpointActive(
    endpointId,
    is_active ?? true,
    rate_limit_per_minute,
    ctx.principal.userId
  );
  const endpoints = await apiManagementService.getEndpoints();
  const updated = endpoints.find((e) => e.id === endpointId);
  return { data: updated };
});
