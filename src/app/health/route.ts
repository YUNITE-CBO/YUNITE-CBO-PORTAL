/**
 * Lightweight health endpoint — process-alive check only.
 *
 * This endpoint is intentionally minimal: it does NOT query Supabase,
 * PostgreSQL, Gemini, OpenRouter, or any external dependency. It returns
 * HTTP 200 the instant the Next.js server process is listening, so Render
 * (or any external uptime monitor) can detect that the service is up.
 *
 * Deep system health (database, AI providers, business-rule compliance)
 * belongs to the YUNITE AI Intelligence Engine and the existing
 * `GET /api/health` endpoint — NOT here.
 *
 * Security: exposes no secrets, no env vars, no DB info, no version strings.
 */

import { NextResponse } from 'next/server';
import { lifecycleLogger } from '@/lib/logging/lifecycle-logger';

export const dynamic = 'force-dynamic';

export function GET() {
  lifecycleLogger.healthCheck();
  return NextResponse.json({
    status: 'ok',
    service: 'yunite-cbo-api',
    timestamp: new Date().toISOString(),
  });
}
