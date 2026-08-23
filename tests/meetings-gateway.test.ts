/**
 * Static guarantees for the portal-meetings gateway path.
 *
 * The member-lookup portal's "Upcoming meetings" reads GET /api/v1/meetings
 * (manifest id meetings.list, scope meetings.read) with its server-side API
 * key. Gateway authorization for API-key clients requires an explicit
 * meetings.read grant in api_client_permissions — provided ONLY by migration
 * 048 (or a manual grant in Settings → API Keys). If 048 has not been run on
 * the live DB the gateway 403s and the portal renders its graceful
 * "meetings unavailable" state.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ENDPOINTS, AVAILABLE_SCOPES } from '@/lib/api/manifest';

export {};

const MIGRATION = join(__dirname, '..', 'supabase', 'migrations', '048_meetings_scope_grant.sql');

describe('portal meetings gateway path', () => {
  it('manifest exposes meetings.list as GET /api/v1/meetings', () => {
    const ep = ENDPOINTS.find((e) => e.id === 'meetings.list');
    expect(ep).toBeDefined();
    expect(ep!.method).toBe('GET');
    expect(ep!.path).toBe('/api/v1/meetings');
    expect(`${ep!.module}.${ep!.action}`).toBe('meetings.read');
  });

  it('meetings.read is a grantable scope', () => {
    expect(AVAILABLE_SCOPES.some((s) => s.label === 'meetings.read')).toBe(true);
  });

  it('migration 048 exists and grants meetings.read to active eligible clients', () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('api_client_permissions');
    expect(sql).toMatch(/'meetings',\s*'read'/);
    expect(sql).toMatch(/client_type\s*=\s*'lookup'/);
    expect(sql).toContain('ON CONFLICT');
  });

  it('gateway route file exists for meetings.list', () => {
    const route = join(__dirname, '..', 'src', 'app', 'api', 'v1', 'meetings', 'route.ts');
    expect(existsSync(route)).toBe(true);
    const src = readFileSync(route, 'utf8');
    expect(src).toContain("createHandler('meetings.list'");
    expect(src).toContain("force-dynamic");
  });
});
