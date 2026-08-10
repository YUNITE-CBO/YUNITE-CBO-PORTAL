import { NextResponse } from 'next/server';
import { ENDPOINTS, AVAILABLE_SCOPES } from '@/lib/api/manifest';

/**
 * Public API documentation index: entry points, the OpenAPI document URL,
 * authentication schemes, available scopes, and a categorized endpoint list.
 * No secrets. Used by the /dashboard/api-docs Swagger UI and by integrators.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: 'YUNITE API',
      version: 'v1',
      base_url: '/api/v1',
      openapi_url: '/api/v1/docs/openapi.json',
      swagger_ui_url: '/dashboard/api-docs',
      entry_points: {
        health: '/api/v1/health',
        login: '/api/v1/auth/login',
        management: '/api/v1/management/overview',
        docs: '/api/v1/docs',
      },
      authentication: {
        session: {
          type: 'httpOnly cookie',
          name: 'auth_token',
          obtained_via: 'POST /api/v1/auth/login',
          note: 'Used by the admin portal. Subject to the role-based permission matrix.',
        },
        api_key: {
          type: 'Bearer token',
          header: 'Authorization: Bearer yk_live_<token>',
          format: 'yk_live_<48 hex chars> (live) or yk_test_<48 hex chars> (test)',
          obtained_via: 'POST /api/v1/management/keys (super_admin only)',
          storage: 'SHA-256 hashed at rest. Raw key shown once at generation.',
          note: 'Subject to the explicit module.action scopes granted to the client.',
        },
      },
      response_envelope: {
        success: '{ "success": true, "data": {}, "meta": { "request_id": "…" } }',
        error: '{ "success": false, "error": { "code": "…", "message": "…" }, "meta": { "request_id": "…" } }',
      },
      error_codes: [
        'validation_error', 'unauthorized', 'forbidden', 'not_found', 'conflict',
        'rate_limited', 'method_not_allowed', 'client_inactive', 'endpoint_disabled',
        'server_error', 'service_unavailable',
      ],
      rate_limiting: {
        window: '60s token bucket per client',
        tiers: { public: 30, standard: 120, privileged: 600 },
        header: 'x-request-id (echo), Retry-After (on 429)',
      },
      available_scopes: AVAILABLE_SCOPES,
      endpoint_count: ENDPOINTS.length,
      endpoints: ENDPOINTS.map((e) => ({
        id: e.id,
        method: e.method,
        path: e.path,
        module: e.module,
        action: e.action,
        auth: e.auth,
        min_role: e.minRole,
        financial: e.financial ?? false,
        summary: e.summary,
      })),
    },
  });
}
