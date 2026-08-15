-- ============================================
-- Migration 036: YUNITE Media & Asset Engine
-- ============================================
-- Centralized media/asset management. ONE engine for organization logo,
-- member profile photos, user profile photos, official stamps/seals,
-- document logos, and future system assets. Modules consume the engine;
-- they do NOT implement independent upload logic.
--
-- Design:
--  * media_assets is the single source of truth for uploaded assets.
--  * An asset is owned by (owner_type, owner_id) and classified by
--    asset_type (ORGANIZATION_LOGO, MEMBER_PROFILE_PHOTO, ...).
--  * External URLs (legacy logoUrl / avatarUrl strings) remain supported
--    via the `external_url` column + the source discriminator — they are
--    NOT pretended to be Supabase storage objects.
--  * Existing logo_url / profile_photo_url / avatar_url columns keep
--    working (compatibility layer); they are backfilled to point at the
--    asset public_url where an asset exists.
--  * Immutable generated_documents keep their own logo snapshot — changing
--    the org logo NEVER mutates previously generated documents.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / ON CONFLICT DO UPDATE). Safe to re-run.
-- ============================================

-- ---------- media_assets table ----------
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Discriminator: 'uploaded' (Supabase Storage object) vs 'external' (URL).
  source TEXT NOT NULL DEFAULT 'uploaded' CHECK (source IN ('uploaded', 'external')),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('organization', 'member', 'user', 'system')),
  owner_id TEXT NOT NULL,                 -- org id/'default', member uuid, user uuid, 'system'
  asset_type TEXT NOT NULL,               -- ORGANIZATION_LOGO | MEMBER_PROFILE_PHOTO | USER_PROFILE_PHOTO | ORGANIZATION_STAMP | DOCUMENT_LOGO | SYSTEM_ASSET
  storage_bucket TEXT,                    -- Supabase storage bucket (uploaded only)
  storage_path TEXT,                      -- object path within bucket (uploaded only)
  public_url TEXT,                        -- public URL (uploaded) — cache-bustable via version
  external_url TEXT,                      -- the raw URL (external only)
  mime_type TEXT,
  file_size BIGINT,
  width INTEGER,
  height INTEGER,
  original_filename TEXT,
  version INTEGER NOT NULL DEFAULT 1,     -- bumped on replace → cache-busting (?v=)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ACTIVE asset per (owner_type, owner_id, asset_type). Replacing creates
-- a new active row + archives the previous one; only one active row exists.
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_active_unique
  ON media_assets (owner_type, owner_id, asset_type)
  WHERE status = 'active';

-- Lookups by owner + type, and integrity checks (orphan detection) by path.
CREATE INDEX IF NOT EXISTS media_assets_owner_type_idx
  ON media_assets (owner_type, owner_id, asset_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS media_assets_storage_path_idx
  ON media_assets (storage_bucket, storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_assets_status_idx ON media_assets (status);

-- updated_at auto-touch.
CREATE OR REPLACE FUNCTION media_assets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS media_assets_updated_at ON media_assets;
CREATE TRIGGER media_assets_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION media_assets_set_updated_at();

-- ---------- media configuration category + settings ----------
-- Seeded under a new 'media' config category so it auto-renders in the
-- Settings UI. The upload limit / allowed types are NOT hard-coded in
-- multiple places — they live here as the single source of truth.
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order)
SELECT 'media', 'Media & Assets', 'Centralized media engine: upload limits, allowed types', 'image', '#7C3AED', 14
WHERE NOT EXISTS (SELECT 1 FROM configuration_categories WHERE code = 'media')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;

-- Max upload size (MB). 50 MB default per spec.
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'media.upload_limit_mb', '50', 'media', 'number', 1, 'Maximum image upload size in megabytes'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'media.upload_limit_mb');

-- Allowed image MIME types (comma-separated).
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'media.allowed_types', 'image/png,image/jpeg,image/webp', 'media', 'string', 2, 'Allowed image MIME types (comma-separated). SVG is blocked unless a sanitizer exists.'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'media.allowed_types');

-- Public storage bucket name for branding (logo/stamp) — intentionally public.
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'media.bucket.branding', 'yunite-branding', 'media', 'string', 3, 'Supabase storage bucket for public org branding (logo/stamp)'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'media.bucket.branding');

-- Private storage bucket name for member/user photos — served via signed URLs.
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'media.bucket.profiles', 'yunite-profiles', 'media', 'string', 4, 'Supabase storage bucket for private member/user profile photos'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'media.bucket.profiles');

-- ---------- ensure the legacy columns exist everywhere they are referenced ----------
-- members.profile_photo_url (migration 011) — ensure it exists.
ALTER TABLE members ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
-- users.avatar_url (migration 006) — ensure it exists.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ---------- storage buckets ----------
-- Create the buckets idempotently. Storage API is available in SQL via
-- storage.buckets (Supabase). Policies are set so branding is public-readable
-- and profiles are private (signed-URL access only).
INSERT INTO storage.buckets (id, name, public)
SELECT 'yunite-branding', 'yunite-branding', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'yunite-branding');

INSERT INTO storage.buckets (id, name, public)
SELECT 'yunite-profiles', 'yunite-profiles', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'yunite-profiles');

-- Branding bucket: public read, authenticated write (admins via service role).
DROP POLICY IF EXISTS "yunite-branding public read" ON storage.objects;
CREATE POLICY "yunite-branding public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'yunite-branding');

DROP POLICY IF EXISTS "yunite-branding authenticated write" ON storage.objects;
CREATE POLICY "yunite-branding authenticated write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'yunite-branding');

DROP POLICY IF EXISTS "yunite-branding authenticated update" ON storage.objects;
CREATE POLICY "yunite-branding authenticated update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'yunite-branding');

DROP POLICY IF EXISTS "yunite-branding authenticated delete" ON storage.objects;
CREATE POLICY "yunite-branding authenticated delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'yunite-branding');

-- Profiles bucket: private. Reads via signed URLs (service role). Writes by
-- authenticated users (the API enforces role checks server-side).
DROP POLICY IF EXISTS "yunite-profiles auth read" ON storage.objects;
CREATE POLICY "yunite-profiles auth read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'yunite-profiles');

DROP POLICY IF EXISTS "yunite-profiles auth write" ON storage.objects;
CREATE POLICY "yunite-profiles auth write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'yunite-profiles');

DROP POLICY IF EXISTS "yunite-profiles auth update" ON storage.objects;
CREATE POLICY "yunite-profiles auth update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'yunite-profiles');

DROP POLICY IF EXISTS "yunite-profiles auth delete" ON storage.objects;
CREATE POLICY "yunite-profiles auth delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'yunite-profiles');

-- ---------- backfill: point legacy columns at active media assets ----------
-- If an active ORGANIZATION_LOGO asset exists, mirror its URL into the
-- organization.logo_url setting so legacy consumers keep working.
INSERT INTO settings (key, value, category, data_type, help_text)
SELECT 'organization.logo_url',
       COALESCE(ma.public_url, ma.external_url),
       'organization', 'string', 'Organization logo (managed by the Media Engine)'
FROM media_assets ma
WHERE ma.owner_type = 'organization'
  AND ma.asset_type = 'ORGANIZATION_LOGO'
  AND ma.status = 'active'
  AND COALESCE(ma.public_url, ma.external_url) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.logo_url')
-- Multiple organizations may each hold an active ORGANIZATION_LOGO asset, so
-- the SELECT above can yield several rows that all share the single global
-- key 'organization.logo_url' (UNIQUE NOT NULL). Keep only the first to avoid
-- a unique_violation at runtime; ON CONFLICT also makes this re-runnable.
-- COALESCE(public_url, external_url) IS NOT NULL guards settings.value
-- (NOT NULL): uploaded assets expose public_url while external assets expose
-- external_url, so either flavor backfills safely and neither can produce a
-- NULL value (not_null_violation) at runtime.
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- DEPLOY: run this migration in the Supabase SQL Editor.
-- The Media Engine service reads media.* settings as the single source of
-- truth for upload limits / allowed types / bucket names.
-- ============================================
