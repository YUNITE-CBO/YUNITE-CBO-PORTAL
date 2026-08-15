/**
 * Auth guard for Media Engine routes.
 *
 * Permission model (respects the existing YUNITE authorization system):
 *   - ORGANIZATION_LOGO / ORGANIZATION_STAMP / DOCUMENT_LOGO / SYSTEM_ASSET:
 *     admin+ (super_admin allowed). Org branding is org-wide.
 *   - MEMBER_PROFILE_PHOTO: staff+ (staff manage member profiles).
 *   - USER_PROFILE_PHOTO: a user may manage their OWN photo; only an admin
 *     may manage ANOTHER user's photo.
 *
 * Never bypasses authentication or role checks.
 */
import { NextResponse } from 'next/server';
import { authService } from '@/lib/services/auth.service';
import type { MediaAssetType, MediaOwnerType } from '@/lib/services/media/media-asset.service';

export interface MediaAuthResult {
  ok: boolean;
  response?: NextResponse;
  userId?: string;
  role?: string;
  isSuperAdmin?: boolean;
}

export async function requireMediaAuth(
  ownerType: MediaOwnerType,
  ownerId: string,
  assetType: MediaAssetType,
): Promise<MediaAuthResult> {
  const session = await authService.getSession();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = session.user.role;
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;

  // Own user photo: a user can manage their own photo regardless of role.
  if (ownerType === 'user' && assetType === 'USER_PROFILE_PHOTO' && ownerId === session.user.id) {
    return { ok: true, userId: session.user.id, role, isSuperAdmin };
  }

  // Org branding + system assets: admin+ only.
  if (ownerType === 'organization' || assetType === 'ORGANIZATION_LOGO' || assetType === 'ORGANIZATION_STAMP' || assetType === 'DOCUMENT_LOGO' || assetType === 'SYSTEM_ASSET') {
    if (!isAdmin) {
      return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden: admin access required to manage organization assets' }, { status: 403 }) };
    }
    return { ok: true, userId: session.user.id, role, isSuperAdmin };
  }

  // Member photos: staff+ (staff manage member profiles).
  if (ownerType === 'member' && assetType === 'MEMBER_PROFILE_PHOTO') {
    if (!isAdmin && role !== 'staff') {
      return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden: staff+ access required to manage member photos' }, { status: 403 }) };
    }
    return { ok: true, userId: session.user.id, role, isSuperAdmin };
  }

  // Another user's photo: admin+ only.
  if (ownerType === 'user' && assetType === 'USER_PROFILE_PHOTO') {
    if (!isAdmin) {
      return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden: admin access required to manage another user photo' }, { status: 403 }) };
    }
    return { ok: true, userId: session.user.id, role, isSuperAdmin };
  }

  return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
}
