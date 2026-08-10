/**
 * API gateway consistency tests.
 *
 * Guards against the class of bug where a route file calls
 * createHandler('endpoint.id') with an id that is NOT declared in the
 * endpoint manifest. The createHandler wrapper throws a 500 "Unknown
 * endpoint" for any unregistered id, so a typo silently breaks a route at
 * runtime. This test scans every /api/v1 route file at test time and
 * asserts that each createHandler id is present in the manifest.
 *
 * These are pure static checks against the source + manifest module, so
 * they run without a database or running server.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ENDPOINTS, AVAILABLE_SCOPES } from '@/lib/api/manifest';
import { applyCorsHeaders, corsPreflightResponse } from '@/lib/api/cors';
import { NextRequest, NextResponse } from 'next/server';
import { parseScopeList, isGrantableScope } from '@/lib/api/scopes';
import { ApiError } from '@/lib/api/error';
import { authorize, type ApiPrincipal } from '@/lib/api/principal';

const V1_ROUTES_DIR = path.join(__dirname, '..', 'src', 'app', 'api', 'v1');

function walkRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRoutes(full, acc);
    } else if (entry.name === 'route.ts') {
      acc.push(full);
    }
  }
  return acc;
}

function extractCreateHandlerIds(routeFile: string): string[] {
  const src = fs.readFileSync(routeFile, 'utf8');
  const ids: string[] = [];
  const re = /createHandler\(\s*['"`]([a-z.]+)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

describe('YUNITE API gateway consistency', () => {
  const manifestIds = new Set(ENDPOINTS.map((e) => e.id));

  it('every createHandler id used in a route exists in the manifest', () => {
    const routeFiles = walkRoutes(V1_ROUTES_DIR);
    expect(routeFiles.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const file of routeFiles) {
      const ids = extractCreateHandlerIds(file);
      for (const id of ids) {
        if (!manifestIds.has(id)) {
          missing.push(`${file}: createHandler('${id}') — not in manifest`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('every management (api.*) endpoint is super_admin only', () => {
    const nonSuperAdmin = ENDPOINTS.filter(
      (e) => e.module === 'api' && e.minRole !== 'super_admin'
    );
    expect(nonSuperAdmin).toEqual([]);
  });

  it('every endpoint has a unique id and unique method+path', () => {
    const ids = ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    const keys = ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('grantable scopes exclude internal api management scopes', () => {
    for (const s of AVAILABLE_SCOPES) {
      expect(s.module).not.toBe('api');
    }
    // members.read is one of the most basic scopes and must be grantable.
    expect(AVAILABLE_SCOPES.some((s) => s.label === 'members.read')).toBe(true);
  });

  it('all endpoints declare a valid auth level', () => {
    const valid = new Set(['required', 'optional', 'public']);
    const bad = ENDPOINTS.filter((e) => !valid.has(e.auth));
    expect(bad).toEqual([]);
  });

  it('middleware lets /api/v1/* through to the gateway (no cookie-only block)', () => {
    const mw = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'middleware.ts'),
      'utf8'
    );
    // The gateway does its own auth (session OR API key). The middleware must
    // short-circuit /api/v1 before the older cookie-only block runs, otherwise
    // API-key clients (no session cookie) get 401'd on POST/PUT/DELETE.
    expect(mw).toMatch(/\/api\/v1/);
    // The v1 bypass must appear before the generic '/api/' cookie check.
    const v1BypassIdx = mw.indexOf("pathname.startsWith('/api/v1')");
    const genericApiIdx = mw.indexOf("pathname.startsWith('/api/')");
    expect(v1BypassIdx).toBeGreaterThan(-1);
    expect(genericApiIdx).toBeGreaterThan(-1);
    expect(v1BypassIdx).toBeLessThan(genericApiIdx);
  });

  it('middleware wires CORS preflight + headers for /api/v1', () => {
    const mw = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'middleware.ts'),
      'utf8'
    );
    expect(mw).toMatch(/corsPreflightResponse/);
    expect(mw).toMatch(/applyCorsHeaders/);
    expect(mw).toMatch(/OPTIONS/);
  });

  describe('cors helper', () => {
    function makeRequest(origin: string | null): NextRequest {
      const headers = new Headers();
      if (origin) headers.set('origin', origin);
      return new NextRequest('https://gateway.test/api/v1/members/lookup', {
        method: 'GET',
        headers,
      });
    }

    afterEach(() => {
      delete process.env.YUNITE_API_CORS_ORIGINS;
    });

    it('emits no CORS headers when no allowlist is configured (locked down)', () => {
      const res = applyCorsHeaders(NextResponse.json({ ok: true }), makeRequest('https://app.vercel.app'));
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('reflects an allowlisted origin with credentials', () => {
      process.env.YUNITE_API_CORS_ORIGINS = 'https://app.vercel.app';
      const res = applyCorsHeaders(NextResponse.json({ ok: true }), makeRequest('https://app.vercel.app'));
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.vercel.app');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
      expect(res.headers.get('vary')).toContain('Origin');
    });

    it('does not reflect an origin that is not in the allowlist', () => {
      process.env.YUNITE_API_CORS_ORIGINS = 'https://app.vercel.app';
      const res = applyCorsHeaders(NextResponse.json({ ok: true }), makeRequest('https://evil.test'));
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('supports wildcard mode without credentials', () => {
      process.env.YUNITE_API_CORS_ORIGINS = '*';
      const res = applyCorsHeaders(NextResponse.json({ ok: true }), makeRequest('https://anything.test'));
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });

    it('builds a 204 preflight with methods/headers/max-age for allowlisted origins', () => {
      process.env.YUNITE_API_CORS_ORIGINS = 'https://app.vercel.app';
      const req = new NextRequest('https://gateway.test/api/v1/members/lookup', {
        method: 'OPTIONS',
        headers: new Headers({
          origin: 'https://app.vercel.app',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        }),
      });
      const res = corsPreflightResponse(req)!;
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.vercel.app');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
      expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
      expect(res.headers.get('access-control-max-age')).toBeTruthy();
    });

    it('returns null preflight when no allowlist is configured', () => {
      expect(corsPreflightResponse(makeRequest('https://app.vercel.app'))).toBeNull();
    });
  });

  describe('permission scope validation', () => {
    it('AVAILABLE_SCOPES is non-empty and all entries are grantable', () => {
      expect(AVAILABLE_SCOPES.length).toBeGreaterThan(0);
      for (const s of AVAILABLE_SCOPES) {
        expect(isGrantableScope(s.label)).toBe(true);
      }
    });

    it('members.lookup is a grantable scope (the lookup use case)', () => {
      expect(isGrantableScope('members.lookup')).toBe(true);
    });

    it('parseScopeList accepts valid scopes and splits module/action', () => {
      const out = parseScopeList(['members.lookup', 'members.read', 'transactions.read']);
      expect(out).toEqual([
        { module: 'members', action: 'lookup' },
        { module: 'members', action: 'read' },
        { module: 'transactions', action: 'read' },
      ]);
    });

    it('parseScopeList tolerates empty/whitespace entries', () => {
      expect(parseScopeList(['members.lookup', '', '  '])).toEqual([
        { module: 'members', action: 'lookup' },
      ]);
    });

    it('parseScopeList rejects non-array input', () => {
      expect(() => parseScopeList('members.lookup')).toThrow();
      expect(() => parseScopeList(undefined)).toThrow();
    });

    it('parseScopeList rejects malformed scope strings', () => {
      expect(() => parseScopeList(['nomodule'])).toThrow();
      expect(() => parseScopeList(['.noaction'])).toThrow();
      expect(() => parseScopeList(['nomodule.'])).toThrow();
    });

    it('parseScopeList rejects scopes not in AVAILABLE_SCOPES (typos / api.manage)', () => {
      expect(() => parseScopeList(['members.readx'])).toThrow();
      expect(() => parseScopeList(['api.manage'])).toThrow();
      expect(() => parseScopeList(['members.read', 'fakescope.do'])).toThrow();
    });

    it('parseScopeList throws ApiError validation errors', () => {
      try {
        parseScopeList(['nope.nope']);
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).code).toBe('validation_error');
      }
    });

    it('the management create/permissions routes import parseScopeList (validated grants)', () => {
      const createRoute = fs.readFileSync(
        path.join(V1_ROUTES_DIR, 'management', 'clients', 'route.ts'),
        'utf8'
      );
      const permsRoute = fs.readFileSync(
        path.join(V1_ROUTES_DIR, 'management', 'clients', '[id]', 'permissions', 'route.ts'),
        'utf8'
      );
      expect(createRoute).toMatch(/parseScopeList/);
      expect(permsRoute).toMatch(/parseScopeList/);
    });

    it('ApiSettingsSection shows the scope editor on client creation', () => {
      const ui = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'components', 'settings', 'ApiSettingsSection.tsx'),
        'utf8'
      );
      // openCreateClient must set showScopesEditor true (not false), otherwise a
      // newly created client silently starts with zero grantable scopes.
      const createFnStart = ui.indexOf('const openCreateClient');
      const createFnEnd = ui.indexOf('};', createFnStart);
      const createFn = ui.slice(createFnStart, createFnEnd);
      expect(createFn).toMatch(/setShowScopesEditor\(true\)/);
    });

    it('ApiSettingsSection loads available scopes on mount (not only on the Endpoints tab)', () => {
      // The Permission Scopes editor is rendered on the Clients tab, so the
      // scope list must be populated regardless of which tab is active. Tying
      // scope loading to the Endpoints tab leaves scopes empty when the operator
      // opens New/Edit Client from the Clients tab, rendering zero checkboxes.
      const ui = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'components', 'settings', 'ApiSettingsSection.tsx'),
        'utf8'
      );
      // There must be a dedicated scope loader.
      expect(ui).toMatch(/const loadScopes = useCallback/);
      // It must be invoked by a mount-only effect (independent of `tab`).
      const mountEffectIdx = ui.indexOf('loadScopes();');
      expect(mountEffectIdx).toBeGreaterThan(-1);
      const mountEffectBlock = ui.slice(ui.lastIndexOf('useEffect', mountEffectIdx), mountEffectIdx);
      // The mount effect must NOT key on `tab` (the tab-keyed effect is separate).
      expect(mountEffectBlock).not.toMatch(/\btab\b/);
      // The scope grid must degrade gracefully when scopes are still loading.
      expect(ui).toMatch(/scopes\.length === 0/);
    });
  });

  describe('session-auth authorization honors manifest minRole', () => {
    function sessionPrincipal(role: string): ApiPrincipal {
      return {
        authMode: 'session',
        clientId: '00000000-0000-0000-0000-000000000001',
        clientName: 'admin-portal',
        clientType: 'admin_portal',
        clientTier: 'privileged',
        userId: 'u-1',
        userEmail: 'staff@example.org',
        role,
      };
    }

    function endpointMinRole(module: string, action: string) {
      const e = ENDPOINTS.find((x) => x.module === module && x.action === action);
      return e?.minRole;
    }

    it('every non-public endpoint with a declared minRole authorizes a session user at that role', () => {
      // For each manifest endpoint that is not public and declares a minRole,
      // a session principal at exactly that role must be authorized.
      for (const e of ENDPOINTS) {
        if (e.auth === 'public' || !e.minRole) continue;
        const role = e.minRole as NonNullable<typeof e.minRole>;
        expect(() => authorize(sessionPrincipal(role), e.module, e.action, role)).not.toThrow();
      }
    });

    it('modules missing from the legacy matrix (compliance, statements, dashboard) now allow viewer per minRole', () => {
      // Previously these threw 403 because hasPermission returned false for
      // modules absent from PERMISSIONS. minRole is now the source of truth.
      expect(() => authorize(sessionPrincipal('viewer'), 'compliance', 'read', 'viewer')).not.toThrow();
      expect(() => authorize(sessionPrincipal('viewer'), 'statements', 'read', 'viewer')).not.toThrow();
      expect(() => authorize(sessionPrincipal('viewer'), 'dashboard', 'read', 'viewer')).not.toThrow();
    });

    it('compliance.update requires staff (viewer denied)', () => {
      expect(() => authorize(sessionPrincipal('staff'), 'compliance', 'update', 'staff')).not.toThrow();
      expect(() => authorize(sessionPrincipal('viewer'), 'compliance', 'update', 'staff')).toThrow();
    });

    it('identity-scoped auth.* endpoints (no minRole) allow any authenticated session user', () => {
      // auth.session / auth.profile are own-session endpoints; a viewer must
      // not be 403'd on their own profile/session.
      expect(() => authorize(sessionPrincipal('viewer'), 'auth', 'session')).not.toThrow();
      expect(() => authorize(sessionPrincipal('viewer'), 'auth', 'profile')).not.toThrow();
      expect(() => authorize(sessionPrincipal('staff'), 'auth', 'password')).not.toThrow();
    });

    it('super_admin bypasses every check', () => {
      expect(() => authorize(sessionPrincipal('super_admin'), 'compliance', 'update', 'staff')).not.toThrow();
      expect(() => authorize(sessionPrincipal('super_admin'), 'api', 'manage', 'super_admin')).not.toThrow();
    });

    it('viewer is denied staff/admin-only endpoints per minRole', () => {
      expect(() => authorize(sessionPrincipal('viewer'), 'members', 'create', 'staff')).toThrow();
      expect(() => authorize(sessionPrincipal('viewer'), 'settings', 'update', 'admin')).toThrow();
    });

    it('contributions campaigns.create is admin-only per manifest minRole', () => {
      // The manifest declares minRole: 'admin' for campaign creation; staff
      // must be denied even though the legacy matrix had contributions.create
      // at staff level.
      expect(() => authorize(sessionPrincipal('admin'), 'contributions', 'create', 'admin')).not.toThrow();
      expect(() => authorize(sessionPrincipal('staff'), 'contributions', 'create', 'admin')).toThrow();
    });

    it('the handler passes the manifest minRole to authorize', () => {
      const handler = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'lib', 'api', 'handler.ts'),
        'utf8'
      );
      expect(handler).toMatch(/authorize\(principal,\s*spec\.module,\s*spec\.action,\s*spec\.minRole\)/);
    });

    it('every required endpoint resolves a minRole (or is identity-scoped auth.*)', () => {
      // Guardrail: no required endpoint silently falls through with an
      // unintended missing minRole except the auth.* own-session surface.
      for (const e of ENDPOINTS) {
        if (e.auth !== 'required') continue;
        if (e.module === 'auth') continue; // identity-scoped
        expect(e.minRole).toBeTruthy();
        expect(endpointMinRole(e.module, e.action)).toBeTruthy();
      }
    });

    it('anonymous principals are never authorized', () => {
      const anon: ApiPrincipal = {
        authMode: 'anonymous',
        clientId: '00000000-0000-0000-0000-000000000002',
        clientName: 'anonymous',
        clientType: 'third_party',
        clientTier: 'public',
      };
      expect(() => authorize(anon, 'members', 'read', 'viewer')).toThrow();
    });

    it('API-key clients use the explicit scope set, not minRole', () => {
      const key: ApiPrincipal = {
        authMode: 'api_key',
        clientId: 'c-1',
        clientName: 'ext',
        clientType: 'third_party',
        clientTier: 'standard',
        keyId: 'k-1',
        clientPermissions: new Set(['members.read']),
      };
      expect(() => authorize(key, 'members', 'read', 'viewer')).not.toThrow();
      // minRole is irrelevant for api-key clients; granted scope is what matters.
      expect(() => authorize(key, 'members', 'create', 'staff')).toThrow();
    });
  });
});
