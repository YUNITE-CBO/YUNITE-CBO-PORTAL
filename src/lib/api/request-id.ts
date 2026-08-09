/**
 * YUNITE API — Request tracing
 *
 * Every gateway request gets a stable request id. If the caller supplies
 * one (X-Request-Id) it is reused (sanitized); otherwise a new id is
 * generated. The id is attached to every response and every log row.
 */

import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_HEADER = 'x-request-id';
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function getRequestId(request: NextRequest): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  if (incoming && ID_RE.test(incoming)) return incoming;
  return generateRequestId();
}

export function generateRequestId(): string {
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(12).toString('hex');
}

export function attachRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
