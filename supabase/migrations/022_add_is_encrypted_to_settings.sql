-- ===================================================================
-- Ensure settings table has all expected optional columns
--
-- Background:
-- The configuration service (src/lib/services/configuration.service.ts)
-- and TypeScript types reference several columns (is_encrypted, is_public,
-- data_type, display_order, help_text, etc.) that were meant to be added
-- by migration 007. On some databases migration 007 was only partially
-- applied, leaving columns like is_encrypted / is_public absent. Selecting
-- a non-existent column makes PostgREST error out, so every updateSetting
-- call failed with "Setting not found", surfacing to users as
-- "Some settings failed to update".
--
-- This migration re-applies all the migration 007 ALTER TABLE statements
-- idempotently (IF NOT EXISTS) so the settings table matches the schema
-- the application expects, regardless of prior partial application.
-- ===================================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS config_category_id UUID REFERENCES configuration_categories(id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'string'
  CHECK (data_type IN ('string', 'number', 'boolean', 'json', 'password'));
ALTER TABLE settings ADD COLUMN IF NOT EXISTS validation_pattern TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_value NUMERIC;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_value NUMERIC;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS help_text TEXT;

-- Mark password-typed settings as encrypted so their values are masked
-- in configuration history and audit logs.
UPDATE settings
SET is_encrypted = TRUE
WHERE data_type = 'password' AND is_encrypted = FALSE;
