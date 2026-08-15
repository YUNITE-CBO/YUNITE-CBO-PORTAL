/**
 * YUNITE Media Engine API — single endpoint for every asset.
 *
 *   GET    /api/media/{ownerType}/{ownerId}/{assetType}        → resolve active asset
 *   POST   /api/media/{ownerType}/{ownerId}/{assetType}        → upload (multipart) OR set external URL (JSON {url})
 *   DELETE /api/media/{ownerType}/{ownerId}/{assetType}        → remove active asset
 *
 * Modules call this; they do NOT implement their own upload logic.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { mediaAssetService, type MediaAssetType, type MediaOwnerType } from '@/lib/services/media/media-asset.service';
import { requireMediaAuth } from '../../../_guard';
import { getClientIP, getUserAgent } from '@/lib/auth/server-auth';

const VALID_OWNERS = new Set(['organization', 'member', 'user', 'system']);
const VALID_ASSETS = new Set([
  'ORGANIZATION_LOGO', 'MEMBER_PROFILE_PHOTO', 'USER_PROFILE_PHOTO',
  'ORGANIZATION_STAMP', 'DOCUMENT_LOGO', 'SYSTEM_ASSET',
]);

async function parseParams(params: Promise<{ ownerType: string; ownerId: string; assetType: string }>) {
  const { ownerType, ownerId, assetType } = await params;
  if (!VALID_OWNERS.has(ownerType)) return { error: NextResponse.json({ success: false, error: 'Invalid ownerType' }, { status: 400 }) };
  if (!VALID_ASSETS.has(assetType)) return { error: NextResponse.json({ success: false, error: 'Invalid assetType' }, { status: 400 }) };
  if (!ownerId) return { error: NextResponse.json({ success: false, error: 'ownerId required' }, { status: 400 }) };
  return { ownerType: ownerType as MediaOwnerType, ownerId, assetType: assetType as MediaAssetType };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ownerType: string; ownerId: string; assetType: string }> },
) {
  const parsed = await parseParams(params);
  if ('error' in parsed) return parsed.error;
  // Resolution is public-ish for org branding; member/user photos require auth.
  const needsAuth = parsed.ownerType !== 'organization';
  if (needsAuth) {
    const auth = await requireMediaAuth(parsed.ownerType, parsed.ownerId, parsed.assetType);
    if (!auth.ok) return auth.response!;
  }
  const result = await mediaAssetService.resolve(parsed.ownerType, parsed.ownerId, parsed.assetType);
  return NextResponse.json({ success: true, ...result });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ownerType: string; ownerId: string; assetType: string }> },
) {
  const parsed = await parseParams(params);
  if ('error' in parsed) return parsed.error;
  const auth = await requireMediaAuth(parsed.ownerType, parsed.ownerId, parsed.assetType);
  if (!auth.ok) return auth.response!;

  const contentType = request.headers.get('content-type') || '';

  try {
    // JSON {url} → register an external URL (legacy URL support retained).
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      if (!url) return NextResponse.json({ success: false, error: 'url required' }, { status: 400 });
      const { asset } = await mediaAssetService.setExternalUrl({
        ownerType: parsed.ownerType,
        ownerId: parsed.ownerId,
        assetType: parsed.assetType,
        url,
        createdBy: auth.userId,
        ip: getClientIP(request),
        userAgent: getUserAgent(request),
      });
      return NextResponse.json({ success: true, asset });
    }

    // Multipart upload → file.
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'Expected multipart/form-data upload or JSON {url}' }, { status: 400 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'file field required' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { asset } = await mediaAssetService.upload({
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      assetType: parsed.assetType,
      file: { buffer, mimeType: file.type, filename: file.name, size: file.size },
      createdBy: auth.userId,
      ip: getClientIP(request),
      userAgent: getUserAgent(request),
    });
    return NextResponse.json({ success: true, asset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    // Validation failures → 400; storage failures → 500.
    const isValidation = /exceeds|not allowed|signature|URL|Invalid|Protocol|Dangerous/i.test(msg);
    return NextResponse.json({ success: false, error: msg }, { status: isValidation ? 400 : 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ownerType: string; ownerId: string; assetType: string }> },
) {
  const parsed = await parseParams(params);
  if ('error' in parsed) return parsed.error;
  const auth = await requireMediaAuth(parsed.ownerType, parsed.ownerId, parsed.assetType);
  if (!auth.ok) return auth.response!;
  const { removed } = await mediaAssetService.remove({
    ownerType: parsed.ownerType,
    ownerId: parsed.ownerId,
    assetType: parsed.assetType,
    createdBy: auth.userId,
    ip: getClientIP(request),
    userAgent: getUserAgent(request),
  });
  return NextResponse.json({ success: true, removed });
}
