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
});
