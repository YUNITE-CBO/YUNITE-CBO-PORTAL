/**
 * Meetings service.
 *
 * IMPORTANT GAP: The YUNITE backend currently exposes meetings only at
 * `GET /api/meetings` (non-v1), which requires a portal *session* cookie —
 * not the API key this portal uses. There is no `/api/v1/meetings` endpoint
 * and no `meetings.read` API-key scope. Therefore the meetings API key
 * cannot fetch meeting data today.
 *
 * This function attempts the v1 path defensively and returns null (graceful
 * empty state) when the endpoint is unavailable — it NEVER fabricates
 * meetings. See API_GAPS.md for the backend change needed to enable this.
 */

import { apiGet, YuniteApiError } from './client';
import type { Meeting } from './types';

export async function getUpcomingMeetings(): Promise<Meeting[] | null> {
  try {
    // Try the gateway path; if the backend adds /api/v1/meetings later this
    // lights up automatically without a frontend change.
    return await apiGet<Meeting[]>('/api/v1/meetings', { upcoming: 'true' });
  } catch (e) {
    if (e instanceof YuniteApiError && (e.status === 404 || e.code === 'endpoint_not_found')) {
      // Expected until the backend exposes meetings through the gateway.
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
