/**
 * YUNITE API — Request logging
 *
 * Records operational metadata for every gateway request to
 * api_request_logs for observability and the API Management UI.
 *
 * SECURITY: Only operational metadata is stored. Request bodies, auth
 * headers, cookies, API key material, passwords, and tokens are NEVER
 * logged. The raw key never reaches this layer.
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { ApiPrincipal } from './principal';
import type { ApiErrorCode } from './error';

export interface RequestLogEntry {
  request_id: string;
  client_id: string | null;
  client_name: string | null;
  user_id: string | null;
  user_email: string | null;
  auth_mode: ApiPrincipal['authMode'] | 'denied';
  method: string;
  path: string;
  endpoint_id: string | null;
  status_code: number;
  duration_ms: number;
  ip_address: string | null;
  user_agent: string | null;
  error_code: ApiErrorCode | null;
  is_error: boolean;
  is_rate_limited: boolean;
}

/**
 * Persist a request log. Always best-effort: a logging failure must never
 * break the API response (it only warns), matching the project convention
 * for non-critical audit inserts.
 */
export async function logRequest(entry: RequestLogEntry): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from('api_request_logs').insert({
      request_id: entry.request_id,
      client_id: entry.client_id,
      client_name: entry.client_name,
      user_id: entry.user_id,
      user_email: entry.user_email,
      auth_mode: entry.auth_mode,
      method: entry.method,
      path: entry.path,
      endpoint_id: entry.endpoint_id,
      status_code: entry.status_code,
      duration_ms: entry.duration_ms,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      error_code: entry.error_code,
      is_error: entry.is_error,
      is_rate_limited: entry.is_rate_limited,
    });
    if (error) console.warn('[api-request-log] insert failed:', error.message);
  } catch (err) {
    console.warn('[api-request-log] logging error:', err instanceof Error ? err.message : err);
  }
}
