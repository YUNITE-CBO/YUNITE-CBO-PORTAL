/** Media integrity check (admin+) — surfaces DB-vs-storage discrepancies. */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { mediaAssetService } from '@/lib/services/media/media-asset.service';
import { requireAdminAuth } from '@/app/api/ai/_guard';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response!;
  const findings = await mediaAssetService.integrityCheck();
  return NextResponse.json({ success: true, findings, count: findings.length });
}
