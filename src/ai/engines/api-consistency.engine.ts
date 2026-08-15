/**
 * API CONSISTENCY ENGINE (deterministic).
 *
 * Inspects the API architecture from the manifest + recent request logs to
 * detect structural issues: unused/duplicate routes, missing minRole on
 * required endpoints, financial endpoints with low roles, response error
 * patterns, and broken/stale routes (frequent 5xx on a registered route).
 * Uses only read-only metadata — no destructive API calls.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { ENDPOINTS } from '@/lib/api/manifest';
import type { Finding } from '../types';
import { evidence, makeFinding, resetFindingSequence } from './findings';

export async function runApiConsistency(): Promise<{ findings: Finding[]; records_checked: number; checks_performed: number }> {
  resetFindingSequence();
  const supabase = await createServiceClient();
  const findings: Finding[] = [];
  let checksPerformed = 0;
  let recordsChecked = ENDPOINTS.length;

  // 1. Duplicate route keys + ids.
  checksPerformed++;
  const keys = ENDPOINTS.map((e) => `${e.method} ${e.path}`);
  const ids = ENDPOINTS.map((e) => e.id);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupKeys.length) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `${dupKeys.length} duplicate route method+path(s)`,
      module: 'api',
      category: 'duplicate_routes',
      severity: 'high',
      description: 'Two manifest entries resolve to the same method+path, causing route ambiguity.',
      root_cause: 'Two manifest entries share the same HTTP method + path, so the Next.js route resolver cannot disambiguate them.',
      recommendation: 'Give each endpoint a unique method+path combination, or merge the duplicate manifest entries.',
      evidence: [evidence({ source_label: 'manifest', source_type: 'api', actual_value: dupKeys.join(', ') })],
    }));
  }
  if (dupIds.length) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `${dupIds.length} duplicate endpoint id(s)`,
      module: 'api',
      category: 'duplicate_routes',
      severity: 'high',
      description: 'createHandler() throws 500 for an unknown/ambiguous endpoint id.',
      root_cause: 'Two manifest entries share the same endpoint id, so createHandler(id) cannot resolve to a single handler.',
      recommendation: 'Ensure every manifest endpoint id is unique; rename one of the colliding entries and its route file.',
      evidence: [evidence({ source_label: 'manifest', source_type: 'api', actual_value: dupIds.join(', ') })],
    }));
  }

  // 2. Required endpoints missing minRole (identity-scoped exceptions are OK).
  checksPerformed++;
  const requiredNoMinRole = ENDPOINTS.filter((e) => e.auth === 'required' && !e.minRole && !e.module.startsWith('auth'));
  if (requiredNoMinRole.length) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `${requiredNoMinRole.length} required endpoint(s) declare no minRole outside the auth module`,
      module: 'api',
      category: 'incorrect_permissions',
      severity: 'medium',
      description: 'Non-identity-scoped required endpoints should declare a minRole for explicit RBAC.',
      root_cause: 'A required endpoint was added to the manifest without a minRole, so authorization falls back to "any authenticated session".',
      recommendation: 'Set an explicit minRole (e.g. staff/admin) on each required endpoint in the manifest, except identity-scoped auth.* endpoints.',
      evidence: requiredNoMinRole.slice(0, 5).map((e) => evidence({ source_label: 'manifest', source_type: 'api', field: 'minRole', actual_value: e.id })),
    }));
  }

  // 3. Financial endpoints with a low minRole (viewer).
  checksPerformed++;
  const financialLow = ENDPOINTS.filter((e) => e.financial && e.minRole === 'viewer');
  if (financialLow.length) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `${financialLow.length} financial endpoint(s) allow viewer role`,
      module: 'api',
      category: 'incorrect_permissions',
      severity: 'high',
      description: 'Financial (write) operations should require staff+ at minimum.',
      root_cause: 'A financial endpoint was registered with minRole=viewer, allowing under-privileged write access.',
      recommendation: 'Raise the minRole on the affected financial endpoints to staff (or higher) in the manifest.',
      expected_value: 'staff',
      actual_value: 'viewer',
      affected_records: financialLow.map((e) => e.id),
      location: {
        module: 'api',
        submodule: 'RBAC Manifest',
        backend: { route: financialLow[0].path, method: financialLow[0].method },
        business_rule: 'Financial (write) operations should require staff+ at minimum.',
      },
      evidence: financialLow.map((e) => evidence({ source_label: 'manifest', source_type: 'api', field: 'minRole', actual_value: `${e.id}=viewer` })),
    }));
  }

  // 4. Broken/stale routes: high 5xx rate per registered endpoint.
  checksPerformed++;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: logs } = await supabase
    .from('api_request_logs')
    .select('endpoint_id, status_code, is_error')
    .gte('created_at', since);
  recordsChecked += logs?.length ?? 0;
  const perEndpoint = new Map<string, { total: number; err5xx: number }>();
  for (const l of logs ?? []) {
    const e = (l as any).endpoint_id as string | null;
    if (!e) continue;
    const rec = perEndpoint.get(e) ?? { total: 0, err5xx: 0 };
    rec.total++;
    if ((l as any).status_code >= 500) rec.err5xx++;
    perEndpoint.set(e, rec);
  }
  const broken: { ep: string; r: { total: number; err5xx: number } }[] = [];
  perEndpoint.forEach((r, ep) => { if (r.total >= 5 && r.err5xx / r.total >= 0.2) broken.push({ ep, r }); });
  for (const { ep, r } of broken) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `Endpoint ${ep} has a high 5xx rate (${r.err5xx}/${r.total} in 24h)`,
      module: 'api',
      category: 'broken_routes',
      severity: 'high',
      description: 'A registered endpoint is failing on a meaningful fraction of requests.',
      root_cause: 'The endpoint handler is throwing on a meaningful fraction of requests (e.g. unhandled edge case, DB error, or missing env var).',
      recommendation: 'Inspect the endpoint handler logs for the 5xx errors and fix the underlying throw; add error handling so it returns a structured 4xx.',
      evidence: [evidence({ source_label: 'api_request_logs', source_type: 'api', field: 'status_code', actual_value: `${r.err5xx}/${r.total}` })],
    }));
  }

  // 5. Endpoint overrides that disable a route (stale/unused surface).
  checksPerformed++;
  const { data: overrides } = await supabase.from('api_endpoint_overrides').select('endpoint_id, is_active').eq('is_active', false);
  for (const o of overrides ?? []) {
    findings.push(makeFinding({
      prefix: 'API',
      title: `Endpoint ${(o as any).endpoint_id} is disabled via override`,
      module: 'api',
      category: 'stale_routes',
      severity: 'low',
      description: 'A route is administratively disabled. Confirm this is intentional.',
      root_cause: 'An api_endpoint_overrides row set is_active=false for this endpoint, removing it from the live surface.',
      recommendation: 'If intentional, document why; if stale, remove the override row to re-enable the endpoint.',
      human_review: true,
      evidence: [evidence({ source_label: 'api_endpoint_overrides', source_type: 'api', field: 'is_active', actual_value: 'false' })],
    }));
  }

  return { findings, records_checked: recordsChecked, checks_performed: checksPerformed };
}
