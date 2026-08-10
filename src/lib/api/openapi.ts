/**
 * YUNITE API — OpenAPI 3.0 document generator
 *
 * Builds an OpenAPI 3.0 document from the single endpoint manifest so the
 * documentation can never drift from the actual gateway surface. Consumed by
 * the Swagger UI at /dashboard/api-docs and the JSON endpoint at
 * /api/v1/docs/openapi.json.
 */

import { ENDPOINTS, type EndpointSpec, AVAILABLE_SCOPES } from './manifest';

const DESCRIPTION = `
# YUNITE API Gateway

The YUNITE API is the single controlled, versioned, secured, and observable
boundary for the YUNITE ecosystem:

\`\`\`
Application → YUNITE API (/api/v1) → Existing Services → Database
\`\`\`

## Authentication

Every request resolves to a principal through one of two credential types:

- **Session auth** — the admin portal sends the \`auth_token\` httpOnly cookie (JWT).
- **API key auth** — external clients send \`Authorization: Bearer yk_live_…\`.

Both funnel through the same permission model. Session auth uses the role-based
matrix (super_admin bypasses); API-key auth uses the explicit scopes granted to
the client (\`module.action\` strings).

## Response envelope

\`\`\`json
{ "success": true, "data": {}, "meta": { "request_id": "…" } }
\`\`\`

Errors share one shape and one set of codes:

\`\`\`json
{ "success": false, "error": { "code": "forbidden", "message": "…" }, "meta": { "request_id": "…" } }
\`\`\`

Every response carries an \`x-request-id\` header. Supply your own
\`X-Request-Id\` (8–64 alphanumeric chars) to correlate a request across logs.

## Rate limiting

Tier-based token bucket per client, 60-second window:

| Tier       | Default req/min |
|------------|-----------------|
| public     | 30              |
| standard   | 120             |
| privileged | 600             |

Per-endpoint overrides may apply. Rate-limited responses return 429 with a
\`Retry-After: 60\` header.

## Grantable scopes

API-key clients are granted explicit \`module.action\` scopes. The available
(non-management) scopes are:

${AVAILABLE_SCOPES.map((s) => `- \`${s.label}\``).join('\n')}

## API management

Super administrators manage clients, keys, scopes, endpoint overrides, and
view logs/metrics under \`/api/v1/management/*\` and in
**Settings → System Configuration → API Keys**.
`.trim();

function paramFor(spec: EndpointSpec): Record<string, unknown> {
  // Extract {param} segments from the path into OpenAPI path parameters.
  const segs = spec.path.replace(/\/+$/, '').split('/').filter(Boolean);
  const params: Record<string, unknown>[] = [];
  for (const seg of segs) {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      const name = seg.slice(1, -1);
      params.push({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: `${name} path parameter`,
      });
    }
  }
  return { parameters: params.length ? params : undefined };
}

export function buildOpenApiDoc(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const spec of ENDPOINTS) {
    const pathItem = (paths[spec.path] ||= {});
    const extra = paramFor(spec);
    const operation: Record<string, unknown> = {
      operationId: spec.id,
      summary: spec.summary,
      description: spec.description ?? spec.summary,
      tags: [tagFor(spec)],
      security: spec.auth === 'public' ? [] : [{ sessionAuth: [] }, { bearerAuth: [] }],
      ...extra,
      responses: responsesFor(spec),
    };
    if (spec.method === 'POST' || spec.method === 'PUT' || spec.method === 'PATCH') {
      operation.requestBody = requestBodyFor(spec);
    }
    pathItem[spec.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'YUNITE API',
      version: 'v1',
      description: DESCRIPTION,
      contact: { name: 'YUNITE CBO', email: 'info.yunite.ke@gmail.com' },
    },
    servers: [
      { url: '/api/v1', description: 'Current deployment' },
    ],
    tags: tags(),
    components: {
      securitySchemes: {
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'auth_token',
          description: 'Admin portal session (httpOnly JWT cookie).',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'yk_live_…',
          description: 'API key issued to an external client. Format: yk_live_<token> or yk_test_<token>.',
        },
      },
    },
    paths,
  };
}

function tagFor(spec: EndpointSpec): string {
  if (spec.module === 'api') return 'API Management';
  return spec.module.charAt(0).toUpperCase() + spec.module.slice(1);
}

function tags(): { name: string; description: string }[] {
  const names = new Set<string>();
  for (const e of ENDPOINTS) names.add(tagFor(e));
  return Array.from(names).sort().map((name) => ({ name, description: `${name} endpoints.` }));
}

function responsesFor(spec: EndpointSpec): Record<string, unknown> {
  const ok: Record<string, unknown> = {
    description: spec.method === 'POST' ? 'Created' : 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            meta: {
              type: 'object',
              properties: { request_id: { type: 'string' } },
            },
          },
        },
      },
    },
  };

  const errorExamples: Record<string, unknown> = {
    '400': { code: 'validation_error', message: 'Missing required fields: name' },
    '401': { code: 'unauthorized', message: 'Authentication required' },
    '403': { code: 'forbidden', message: 'Insufficient permissions for members.read' },
    '404': { code: 'not_found', message: 'Resource not found' },
    '429': { code: 'rate_limited', message: 'Rate limit exceeded' },
    '500': { code: 'server_error', message: 'Internal server error' },
  };

  const responses: Record<string, unknown> = {
    [spec.method === 'POST' ? '201' : '200']: ok,
  };
  for (const code of Object.keys(errorExamples)) {
    responses[code] = {
      description: errorExamples[code] ? `Error ${code}` : 'Error',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
              meta: { type: 'object', properties: { request_id: { type: 'string' } } },
            },
          },
          example: errorExamples[code],
        },
      },
    };
  }
  if (spec.financial) {
    responses['409'] = {
      description: 'Conflict (e.g. insufficient balance, invalid state transition)',
    };
  }
  return responses;
}

function requestBodyFor(spec: EndpointSpec): Record<string, unknown> | undefined {
  if (spec.method === 'GET' || spec.method === 'DELETE') return undefined;
  // Generic JSON body schema; specific shapes are documented in the operation summary.
  return {
    required: false,
    content: {
      'application/json': {
        schema: { type: 'object', additionalProperties: true },
      },
    },
  };
}
