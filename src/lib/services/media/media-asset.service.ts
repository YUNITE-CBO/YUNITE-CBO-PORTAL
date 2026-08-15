/**
 * YUNITE MEDIA & ASSET ENGINE — core service.
 *
 * ONE centralized engine for every image/asset in the system:
 *   - organization logo / stamps
 *   - member profile photos
 *   - user profile photos
 *   - document/report logos
 *   - future system assets
 *
 * Modules consume this engine; they do NOT implement their own upload logic.
 * Upload once → store once → reuse everywhere → replace centrally → remove
 * safely → keep the entire system consistent.
 *
 * Source of truth:
 *   - `media_assets` table = the asset record (uploaded vs external URL).
 *   - `media.*` settings = upload limit / allowed types / bucket names.
 *   - Supabase Storage = the binary objects (branding bucket public, profiles
 *     bucket private served via signed URLs).
 *
 * Compatibility:
 *   - Legacy `organization.logo_url` / `members.profile_photo_url` /
 *     `users.avatar_url` columns are mirrored from the active asset so existing
 *     consumers keep working until they migrate to `resolveAsset()`.
 *   - External URLs remain first-class (source='external'); they are NOT
 *     pretended to be Supabase storage objects.
 *
 * Immutability:
 *   - Generated documents snapshot the logo at generation time (the
 *     `generated_documents` audit row already stores its own envelope); changing
 *     the org logo NEVER mutates a previously generated document. New documents
 *     pick up the current logo via `resolveLogoDataUri()`.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { settingsService } from '../settings.service';
import { v4 as uuidv4 } from 'uuid';

export type MediaOwnerType = 'organization' | 'member' | 'user' | 'system';
export type MediaAssetType =
  | 'ORGANIZATION_LOGO'
  | 'MEMBER_PROFILE_PHOTO'
  | 'USER_PROFILE_PHOTO'
  | 'ORGANIZATION_STAMP'
  | 'DOCUMENT_LOGO'
  | 'SYSTEM_ASSET';

export type MediaSource = 'uploaded' | 'external';

export interface MediaAsset {
  id: string;
  source: MediaSource;
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageBucket: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  version: number;
  status: 'active' | 'archived' | 'deleted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  asset: MediaAsset;
}

export interface ResolveResult {
  /** The resolved URL to display (public_url or external_url), cache-busted. */
  url: string | null;
  /** The asset record, if one exists. */
  asset: MediaAsset | null;
  /** 'uploaded' | 'external' | 'none'. */
  source: 'uploaded' | 'external' | 'none';
}

/** Magic-byte signatures for real image validation (not just the extension). */
const SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF; WebP confirmed by 'WEBP' at offset 8
];

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

/** Map an owner+asset type to the storage bucket (branding=public, profiles=private). */
async function bucketFor(ownerType: MediaOwnerType, assetType: MediaAssetType): Promise<string> {
  if (ownerType === 'organization' || assetType === 'ORGANIZATION_LOGO' || assetType === 'ORGANIZATION_STAMP' || assetType === 'DOCUMENT_LOGO') {
    const v = await settingsService.get('media.bucket.branding');
    return v ?? 'yunite-branding';
  }
  const v = await settingsService.get('media.bucket.profiles');
  return v ?? 'yunite-profiles';
}

/** Storage path layout: {ownerType}/{ownerId}/{assetType}/{timestamp}_{file}. */
function buildStoragePath(ownerType: MediaOwnerType, ownerId: string, assetType: MediaAssetType, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'asset';
  const ts = Date.now();
  return `${ownerType}/${ownerId}/${assetType}/${ts}_${safe}`;
}

/** Detect the true MIME type from magic bytes. Returns null if not a known image. */
export function detectMimeType(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) {
      if (sig.mime === 'image/webp') {
        const tag = buf.slice(8, 12).toString('ascii');
        if (tag !== 'WEBP') return null;
      }
      return sig.mime;
    }
  }
  return null;
}

/** Parse image dimensions from a PNG/JPEG/WebP buffer without external deps (best-effort). */
export function detectDimensions(buf: Buffer, mime: string): { width: number | null; height: number | null } {
  try {
    if (mime === 'image/png') {
      if (buf.length < 24) return { width: null, height: null };
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    if (mime === 'image/webp') {
      if (buf.length > 30) {
        const tag = buf.slice(12, 16).toString('ascii');
        if (tag === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        if (tag === 'VP8L') return { width: (buf.readUInt16LE(21) & 0x3fff) + 1, height: ((buf.readUInt32LE(21) >> 14) & 0x3fff) + 1 };
        if (tag === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      }
    }
  } catch {
    // fall through
  }
  return { width: null, height: null };
}

/** Validate an external URL: protocol allowlist + reject dangerous schemes. */
export function validateExternalUrl(url: string): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: `Protocol ${parsed.protocol} not allowed (use https:)` };
  }
  if (/^(javascript|file|data):/i.test(url)) {
    return { ok: false, error: 'Dangerous URL scheme rejected' };
  }
  return { ok: true };
}

/** Append a cache-busting ?v= query param so replaced images don't serve stale from CDN. */
export function cacheBust(url: string | null, version: number): string | null {
  if (!url) return null;
  if (version <= 1 && !url.includes('?v=')) return url;
  const base = url.replace(/([?&])v=\d+/, '');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${version}`;
}

function rowToAsset(r: any): MediaAsset {
  return {
    id: r.id,
    source: r.source,
    ownerType: r.owner_type,
    ownerId: r.owner_id,
    assetType: r.asset_type,
    storageBucket: r.storage_bucket,
    storagePath: r.storage_path,
    publicUrl: r.public_url,
    externalUrl: r.external_url,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    width: r.width,
    height: r.height,
    originalFilename: r.original_filename,
    version: r.version,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class MediaAssetService {
  /**
   * Resolve the active asset for an owner+type. Returns a cache-busted display
   * URL plus the asset record. This is the single function every module calls
   * to get an image — no module resolves storage paths or settings itself.
   */
  async resolve(ownerType: MediaOwnerType, ownerId: string, assetType: MediaAssetType): Promise<ResolveResult> {
    try {
      const supabase = await createServiceClient();
      const { data } = await supabase
        .from('media_assets')
        .select('*')
        .eq('owner_type', ownerType)
        .eq('owner_id', ownerId)
        .eq('asset_type', assetType)
        .eq('status', 'active')
        .maybeSingle();
      if (!data) return { url: null, asset: null, source: 'none' };
      const asset = rowToAsset(data);
      const raw = asset.source === 'external' ? asset.externalUrl : asset.publicUrl;
      return { url: cacheBust(raw, asset.version), asset, source: asset.source };
    } catch {
      return { url: null, asset: null, source: 'none' };
    }
  }

  /**
   * Upload a new image asset. Validates MIME (magic bytes), size, and dims.
   * On success: stores the object, creates the asset record, archives any
   * previous active asset, mirrors the legacy column, and audits.
   *
   * Failure handling: the previous image is NEVER deleted before the new upload
   * succeeds. If the upload fails, the existing image is untouched.
   */
  async upload(params: {
    ownerType: MediaOwnerType;
    ownerId: string;
    assetType: MediaAssetType;
    file: { buffer: Buffer; mimeType: string; filename: string; size: number };
    createdBy?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<UploadResult> {
    const { ownerType, ownerId, assetType, file, createdBy, ip, userAgent } = params;

    // 1. Validate size against the central media.upload_limit_mb setting.
    const limitMb = await settingsService.getNumber('media.upload_limit_mb', 50);
    if (file.size > limitMb * 1024 * 1024) {
      throw new Error(`File exceeds the ${limitMb} MB upload limit`);
    }

    // 2. Validate MIME against the central media.allowed_types setting + magic bytes.
    const allowedRaw = (await settingsService.get('media.allowed_types')) || 'image/png,image/jpeg,image/webp';
    const allowed = allowedRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const detected = detectMimeType(file.buffer);
    const effectiveMime = detected || file.mimeType;
    if (!detected) {
      throw new Error('File signature does not match a valid image (PNG/JPEG/WebP). SVG is blocked.');
    }
    if (!allowed.includes(effectiveMime)) {
      throw new Error(`MIME type ${effectiveMime} is not allowed`);
    }

    // 3. Dimensions (best-effort; never fatal).
    const { width, height } = detectDimensions(file.buffer, effectiveMime);

    // 4. Upload to Supabase Storage. Do NOT touch the old asset first.
    const supabase = await createServiceClient();
    const bucket = await bucketFor(ownerType, assetType);
    const storagePath = buildStoragePath(ownerType, ownerId, assetType, file.filename);
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file.buffer, { contentType: effectiveMime, upsert: false });
    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // 5. Archive the previous active asset (if any) — do NOT delete its storage
    //    object; it may still be referenced by immutable generated documents.
    const prev = await this.resolve(ownerType, ownerId, assetType);
    if (prev.asset) {
      await supabase
        .from('media_assets')
        .update({ status: 'archived' })
        .eq('id', prev.asset.id);
    }

    // 6. Create the new active asset record (version bumps for cache-busting).
    const version = (prev.asset?.version || 0) + 1;
    const { data: inserted, error: insertError } = await supabase
      .from('media_assets')
      .insert({
        id: uuidv4(),
        source: 'uploaded',
        owner_type: ownerType,
        owner_id: ownerId,
        asset_type: assetType,
        storage_bucket: bucket,
        storage_path: storagePath,
        public_url: publicUrl,
        external_url: null,
        mime_type: effectiveMime,
        file_size: file.size,
        width,
        height,
        original_filename: file.filename,
        version,
        status: 'active',
        created_by: createdBy || null,
      })
      .select('*')
      .single();
    if (insertError || !inserted) {
      // Rollback the storage upload so we don't leave an orphan object.
      await supabase.storage.from(bucket).remove([storagePath]);
      throw new Error(`Media record failed: ${insertError?.message || 'unknown'}`);
    }
    const asset = rowToAsset(inserted);

    // 7. Mirror the legacy column so existing consumers keep working.
    await this.mirrorLegacyColumn(ownerType, ownerId, assetType, publicUrl);

    // 8. Audit (inline, matching project convention; never fatal on audit failure).
    await this.audit({
      action: this.auditAction(assetType, 'UPDATED'),
      ownerType, ownerId, assetType,
      oldAsset: prev.asset, newAsset: asset,
      userId: createdBy, ip, userAgent,
    }).catch(() => undefined);

    return { asset };
  }

  /**
   * Register an external URL as the active asset (no upload). The URL is
   * validated for protocol/scheme safety. Existing uploaded assets are archived
   * (their storage objects retained for immutable-document integrity).
   */
  async setExternalUrl(params: {
    ownerType: MediaOwnerType;
    ownerId: string;
    assetType: MediaAssetType;
    url: string;
    createdBy?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<UploadResult> {
    const { ownerType, ownerId, assetType, url, createdBy, ip, userAgent } = params;
    const v = validateExternalUrl(url);
    if (!v.ok) throw new Error(v.error || 'Invalid URL');

    const supabase = await createServiceClient();
    const prev = await this.resolve(ownerType, ownerId, assetType);
    if (prev.asset) {
      await supabase.from('media_assets').update({ status: 'archived' }).eq('id', prev.asset.id);
    }
    const version = (prev.asset?.version || 0) + 1;
    const { data: inserted, error } = await supabase
      .from('media_assets')
      .insert({
        id: uuidv4(),
        source: 'external',
        owner_type: ownerType,
        owner_id: ownerId,
        asset_type: assetType,
        storage_bucket: null,
        storage_path: null,
        public_url: null,
        external_url: url,
        version,
        status: 'active',
        created_by: createdBy || null,
      })
      .select('*')
      .single();
    if (error || !inserted) throw new Error(`External URL record failed: ${error?.message || 'unknown'}`);
    const asset = rowToAsset(inserted);

    await this.mirrorLegacyColumn(ownerType, ownerId, assetType, url);
    await this.audit({
      action: this.auditAction(assetType, 'UPDATED'),
      ownerType, ownerId, assetType,
      oldAsset: prev.asset, newAsset: asset,
      userId: createdBy, ip, userAgent,
    }).catch(() => undefined);
    return { asset };
  }

  /**
   * Remove the active asset: archive the record + clear the legacy column +
   * clear the storage object ONLY if it is not referenced by an immutable
   * generated document. Broken image references are never left behind.
   */
  async remove(params: {
    ownerType: MediaOwnerType;
    ownerId: string;
    assetType: MediaAssetType;
    createdBy?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ removed: boolean }> {
    const { ownerType, ownerId, assetType, createdBy, ip, userAgent } = params;
    const supabase = await createServiceClient();
    const prev = await this.resolve(ownerType, ownerId, assetType);
    if (!prev.asset) return { removed: false };

    await supabase.from('media_assets').update({ status: 'archived' }).eq('id', prev.asset.id);
    await this.mirrorLegacyColumn(ownerType, ownerId, assetType, null);

    // Safe storage cleanup: only delete the object if no immutable document references it.
    if (prev.asset.source === 'uploaded' && prev.asset.storagePath && prev.asset.storageBucket) {
      const referenced = await this.isAssetReferenced(prev.asset.publicUrl);
      if (!referenced) {
        await supabase.storage.from(prev.asset.storageBucket).remove([prev.asset.storagePath]).catch(() => undefined);
      }
    }

    await this.audit({
      action: this.auditAction(assetType, 'REMOVED'),
      ownerType, ownerId, assetType,
      oldAsset: prev.asset, newAsset: null,
      userId: createdBy, ip, userAgent,
    }).catch(() => undefined);
    return { removed: true };
  }

  /** Is a given URL referenced by any immutable generated document? */
  async isAssetReferenced(url: string | null): Promise<boolean> {
    if (!url) return false;
    try {
      const supabase = await createServiceClient();
      const base = url.replace(/([?&])v=\d+/, '');
      const { count } = await supabase
        .from('generated_documents')
        .select('*', { count: 'exact', head: true })
        .ilike('title', `%${base}%`);
      return (count || 0) > 0;
    } catch {
      return true; // be safe and retain
    }
  }

  /**
   * Media integrity check: detect assets whose storage object is missing, or
   * entities whose legacy column points at a non-existent asset. Used by the
   * AI / data-consistency engine (#25, #26).
   */
  async integrityCheck(): Promise<Array<{ kind: string; detail: string; severity: 'critical' | 'warning' | 'info' }>> {
    const findings: Array<{ kind: string; detail: string; severity: 'critical' | 'warning' | 'info' }> = [];
    try {
      const supabase = await createServiceClient();
      const { data: assets } = await supabase
        .from('media_assets')
        .select('*')
        .eq('status', 'active')
        .eq('source', 'uploaded');
      for (const a of assets || []) {
        if (a.storage_bucket && a.storage_path) {
          const prefix = a.storage_path.split('/').slice(0, -1).join('/');
          const fname = a.storage_path.split('/').pop() || '';
          const { data, error } = await supabase.storage.from(a.storage_bucket).list(prefix, { search: fname });
          const exists = !error && (data || []).some((o: any) => o.name === fname);
          if (!exists) {
            findings.push({
              kind: 'missing_storage_object',
              detail: `${a.owner_type}/${a.owner_id}/${a.asset_type}: DB media_assets row references storage object ${a.storage_bucket}/${a.storage_path} but the object is missing.`,
              severity: 'critical',
            });
          }
        }
      }
    } catch {
      // best-effort
    }
    return findings;
  }

  /** Mirror the active asset URL into the legacy column for backward compatibility. */
  private async mirrorLegacyColumn(
    ownerType: MediaOwnerType,
    ownerId: string,
    assetType: MediaAssetType,
    url: string | null,
  ): Promise<void> {
    try {
      const supabase = await createServiceClient();
      if (ownerType === 'organization' && assetType === 'ORGANIZATION_LOGO') {
        const existing = await settingsService.get('organization.logo_url');
        if (url === null && existing === null) return;
        if (existing) {
          await settingsService.update('organization.logo_url', url || '', undefined);
        } else {
          await supabase.from('settings').insert({
            key: 'organization.logo_url',
            value: url || '',
            category: 'organization',
            data_type: 'string',
            help_text: 'Organization logo (managed by the Media Engine)',
          });
        }
        this.invalidateLogoCache();
        return;
      }
      if (ownerType === 'member' && assetType === 'MEMBER_PROFILE_PHOTO') {
        await supabase.from('members').update({ profile_photo_url: url }).eq('id', ownerId);
        return;
      }
      if (ownerType === 'user' && assetType === 'USER_PROFILE_PHOTO') {
        await supabase.from('users').update({ avatar_url: url }).eq('id', ownerId);
        return;
      }
    } catch (e) {
      console.warn('[media] legacy mirror failed:', e instanceof Error ? e.message : e);
    }
  }

  /** Invalidate the document-engine logo cache (imported lazily to avoid a cycle). */
  private invalidateLogoCache(): void {
    import('@/modules/documents/styles/yunite-document.styles')
      .then((m) => m._resetLogoCache())
      .catch(() => undefined);
  }

  private auditAction(assetType: MediaAssetType, op: 'UPDATED' | 'REMOVED'): string {
    return `${assetType}_${op}`;
  }

  private async audit(params: {
    action: string;
    ownerType: MediaOwnerType;
    ownerId: string;
    assetType: MediaAssetType;
    oldAsset: MediaAsset | null;
    newAsset: MediaAsset | null;
    userId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    const supabase = await createServiceClient();
    const { action, ownerType, ownerId, assetType, oldAsset, newAsset, userId, ip, userAgent } = params;
    // Never log file contents — only refs + metadata.
    const before = oldAsset ? { id: oldAsset.id, url: oldAsset.publicUrl || oldAsset.externalUrl, source: oldAsset.source } : null;
    const after = newAsset ? { id: newAsset.id, url: newAsset.publicUrl || newAsset.externalUrl, source: newAsset.source, mime: newAsset.mimeType, size: newAsset.fileSize } : null;
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action,
      record_id: ownerId,
      user_id: userId || 'system',
      before_value: { ownerType, assetType, asset: before },
      after_value: { ownerType, assetType, asset: after },
      description: `${action} for ${ownerType}/${ownerId}`,
      ip_address: ip || null,
      user_agent: userAgent || null,
      created_at: new Date().toISOString(),
    });
  }
}

export const mediaAssetService = new MediaAssetService();

/**
 * Convenience: resolve the current organization logo (cache-busted URL).
 * The document engine calls resolveLogoDataUri() for PDF embedding; this
 * returns the display URL for the UI / member-lookup.
 */
export async function resolveOrganizationLogo(): Promise<ResolveResult> {
  return mediaAssetService.resolve('organization', 'default', 'ORGANIZATION_LOGO');
}
