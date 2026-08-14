/**
 * Short-lived member session management.
 *
 * Design: a verified member receives a signed JWT (jose, HS256) stored in an
 * httpOnly, Secure, SameSite=Lax cookie. The JWT binds ONLY the member_id;
 * it carries no financial data and no role. The browser cannot alter it.
 *
 * This prevents one member from accessing another's records: every
 * authenticated data request resolves the member_id from the verified JWT
 * (server-side), never from a URL path or client state.
 */

import { SignJWT, jwtVerify } from 'jose';

const SESSION_COOKIE = 'yunite_ms'; // member-session
const SECRET = new TextEncoder().encode(
  process.env.MEMBER_SESSION_SECRET || 'dev-insecure-secret-change-me-please-32chars',
);
const TTL_SECONDS = Number(process.env.MEMBER_SESSION_TTL_SECONDS || 1800); // 30 min

export interface MemberSession {
  member_id: string;
  /** Unix seconds at which the token was issued. */
  iat: number;
  /** Unix seconds at which the token expires. */
  exp: number;
}

export async function createSession(memberId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ member_id: memberId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(SECRET);
  return jwt;
}

export async function verifySession(token: string | undefined | null): Promise<MemberSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.member_id) return null;
    return {
      member_id: payload.member_id as string,
      iat: Number(payload.iat),
      exp: Number(payload.exp),
    };
  } catch {
    return null; // expired, malformed, or tampered
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_TTL_SECONDS = TTL_SECONDS;

export function isSessionExpired(session: MemberSession): boolean {
  return Date.now() >= session.exp * 1000;
}
