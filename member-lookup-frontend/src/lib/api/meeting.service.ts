/**
 * Meetings service.
 *
 * Meetings come from the gateway's `GET /api/v1/meetings` endpoint
 * (`meetings.read` scope; granted to the portal API client by migration
 * 048). Returns null (graceful empty state) when the endpoint/scope is
 * unavailable — it NEVER fabricates meetings.
 */

import { apiGet, YuniteApiError } from './client';
import type { Meeting } from './types';

export async function getUpcomingMeetings(): Promise<Meeting[] | null> {
  try {
    return await apiGet<Meeting[]>('/api/v1/meetings', { upcoming: 'true' });
  } catch (e) {
    if (e instanceof YuniteApiError && (e.status === 404 || e.status === 403 || e.code === 'endpoint_not_found')) {
      // Endpoint missing (pre-048 backend) or scope not yet granted.
      return null;
    }
    // Any other error → surface as "unavailable", not fabricated data.
    return null;
  }
}

export async function getOrganizationSettings(): Promise<Record<string, string>> {
  // The settings endpoint is the source of truth for org contact info
  // (organization.name, organization.phone, organization.email, etc.).
  try {
    const rows = await apiGet<{ key: string; value: string }[]>('/api/v1/settings');
    const map: Record<string, string> = {};
    for (const r of rows ?? []) map[r.key] = r.value;
    return map;
  } catch {
    return {};
  }
}
