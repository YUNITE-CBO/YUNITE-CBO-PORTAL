/**
 * YUNITE API — Principal resolution
 *
 * A single security boundary resolves every gateway request to an
 * ApiPrincipal, regardless of credential type:
 *
 *   1. Session auth  — the admin portal (cookie `auth_token`, JWT).
 *   2. API key auth  — external clients (Authorization: Bearer yk_...).
 *
 * Both credential types funnel through the same permission model so the
 * gateway enforces one consistent authorization boundary.
 *
 * Security notes:
 *  - JWT verification re-checks that the user is still active and that the
 *    session is still active (the legacy verify path skipped this; the
 *    gateway does not).
 *  - API keys are looked up by SHA-256 hash; the raw key is never logged.
 */

import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiError } from './error';

const JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET || 'your-secret-key-at-least-32-chars'
);

export type AuthMode = 'session' | 'api_key' | 'anonymous';

export interface ApiPrincipal {
  authMode: AuthMode;
  /** Client making the request (admin-portal for sessions, the API client for keys). */
  clientId: string;
  clientName: string;
  clientType: 'admin_portal' | 'lookup' | 'mobile' | 'third_party';
  clientTier: 'public' | 'standard' | 'privileged';
  /** Authenticated portal user (session auth only). */
  userId?: string;
  userEmail?: string;
  /** Role from the JWT (session auth only). API-key clients have no user role. */
  role?: string;
  /** Key id if authenticated via API key. */
  keyId?: string;
  /** Permissions explicitly granted to an API-key client (module.action set). */
  clientPermissions?: Set<string>;
}

const ADMIN_PORTAL_CLIENT: Omit<ApiPrincipal, 'authMode' | 'userId' | 'userEmail' | 'role'> = {
  clientId: '00000000-0000-0000-0000-000000000001',
  clientName: 'YUNITE Admin Portal',
  clientType: 'admin_portal',
  clientTier: 'privileged',
};

/** Hash a raw API key with SHA-256 (the only persisted form). */
export async function hashApiKey(rawKey: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Extract a bearer token from Authorization header. */
function extractBearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

interface SessionRecord {
  user_id: string;
  email: string;
  role: string;
  session_id?: string;
}

async function resolveSession(request: NextRequest): Promise<ApiPrincipal> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    throw ApiError.unauthorized('Authentication required');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWT_SECRET));
  } catch {
    throw ApiError.unauthorized('Invalid or expired session');
  }

  const user_id = payload.user_id as string;
  const email = payload.email as string;
  const role = payload.role as string;
  const session_id = payload.session_id as string | undefined;

  // Re-validate the user is still active (legacy verify skipped this).
  const supabase = await createServiceClient();
  const { data: userRow } = await supabase
    .from('users')
    .select('is_active')
    .eq('id', user_id)
    .maybeSingle();

  if (!userRow || userRow.is_active === false) {
    throw ApiError.unauthorized('Account is inactive');
  }

  // Enforce session revocation when a session id is present.
  if (session_id) {
    const { data: sessionRow } = await supabase
      .from('user_sessions')
      .select('is_active')
      .eq('id', session_id)
      .maybeSingle();
    if (!sessionRow || sessionRow.is_active === false) {
      throw ApiError.unauthorized('Session has been revoked');
    }
  }

  const rec: SessionRecord = { user_id, email, role, session_id };
  return {
    ...ADMIN_PORTAL_CLIENT,
    authMode: 'session',
    userId: rec.user_id,
    userEmail: rec.email,
    role: rec.role,
  };
}

async function resolveApiKey(request: NextRequest): Promise<ApiPrincipal> {
  const rawKey = extractBearer(request);
  if (!rawKey) {
    throw ApiError.unauthorized('Authentication required');
  }

  // Keys are prefixed so an obviously malformed key can be rejected cheaply.
  if (!rawKey.startsWith('yk_')) {
    throw ApiError.unauthorized('Invalid API key format');
  }

  const keyHash = await hashApiKey(rawKey);
  const supabase = await createServiceClient();

  const { data: keyRow, error } = await supabase
    .from('api_keys')
    .select('id, client_id, status, expires_at, last_used_at, last_used_ip')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error || !keyRow) {
    throw ApiError.unauthorized('Invalid API key');
  }

  if (keyRow.status !== 'active') {
    throw ApiError.unauthorized('API key is no longer active');
  }

  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    throw ApiError.unauthorized('API key has expired');
  }

  const { data: clientRow } = await supabase
    .from('api_clients')
    .select('id, name, client_type, status, default_tier')
    .eq('id', keyRow.client_id)
    .maybeSingle();

  if (!clientRow) {
    throw ApiError.unauthorized('API client not found');
  }

  if (clientRow.status !== 'active') {
    throw ApiError.forbidden('API client is inactive');
  }

  // Load the client's granted permission scopes.
  const { data: permRows } = await supabase
    .from('api_client_permissions')
    .select('module, action')
    .eq('client_id', clientRow.id);

  const clientPermissions = new Set<string>(
    (permRows ?? []).map((p: { module: string; action: string }) => `${p.module}.${p.action}`)
  );

  // Update last-used metadata (best-effort; never fail the request on this).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString(), last_used_ip: ip })
    .eq('id', keyRow.id)
    .then(() => undefined, () => undefined);

  return {
    authMode: 'api_key',
    clientId: clientRow.id,
    clientName: clientRow.name,
    clientType: clientRow.client_type,
    clientTier: clientRow.default_tier,
    keyId: keyRow.id,
    clientPermissions,
  };
}

/**
 * Resolve the principal for a gateway request.
 *
 * @param required When true, an absent credential throws unauthorized.
 *                 When false, an anonymous principal is returned (for
 *                 genuinely public endpoints like health).
 */
export async function resolvePrincipal(
  request: NextRequest,
  required = true
): Promise<ApiPrincipal> {
  // Prefer an explicit API key; fall back to the portal session.
  if (extractBearer(request)) {
    try {
      return await resolveApiKey(request);
    } catch (err) {
      // If a bearer was supplied but invalid, do not silently fall back to
      // the cookie — surface the auth failure.
      throw err;
    }
  }

  const cookie = request.cookies.get('auth_token')?.value;
  if (cookie) {
    return resolveSession(request);
  }

  if (required) {
    throw ApiError.unauthorized('Authentication required');
  }

  return {
    authMode: 'anonymous',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientName: 'anonymous',
    clientType: 'third_party',
    clientTier: 'public',
  };
}

/**
 * Authorize a principal against a module.action permission.
 *
 * Session auth uses the existing role-based permission matrix (super_admin
 * bypasses). API-key auth uses the client's explicitly granted scopes.
 */
export function authorize(principal: ApiPrincipal, module: string, action: string): void {
  if (principal.authMode === 'anonymous') {
    throw ApiError.unauthorized('Authentication required');
  }

  if (principal.authMode === 'session') {
    if (principal.role === 'super_admin') return;
    // Reuse the legacy role-based matrix to avoid a second source of truth.
    // Imported lazily to avoid a circular import at module load.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hasPermission } = require('@/lib/auth/authorization') as typeof import('@/lib/auth/authorization');
    if (!hasPermission(principal.role || '', module, action)) {
      throw ApiError.forbidden(`Insufficient permissions for ${module}.${action}`);
    }
    return;
  }

  // API-key clients: explicit scope check only.
  if (!principal.clientPermissions?.has(`${module}.${action}`)) {
    throw ApiError.forbidden(`API client lacks permission ${module}.${action}`);
  }
}
