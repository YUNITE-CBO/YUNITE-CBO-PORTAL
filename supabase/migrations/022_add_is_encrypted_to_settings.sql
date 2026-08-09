-- ===================================================================
-- Add is_encrypted column to settings table
--
-- Background:
-- The configuration service (src/lib/services/configuration.service.ts)
-- selects `is_encrypted` when updating a setting and uses it to mask
-- secret values in configuration history / audit logs. The column was
-- referenced in code and TypeScript types but was never created in the
-- database. As a result every `updateSetting` call failed with
-- "Setting not found" (the PostgREST select errored out), which surfaced
-- to users as "Some settings failed to update".
--
-- This migration creates the missing column and back-fills it for
-- settings whose data_type is 'password' (treated as encrypted/secret).
-- ===================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;

-- Mark password-typed settings as encrypted so their values are masked
-- in configuration history and audit logs.
UPDATE settings
SET is_encrypted = TRUE
WHERE data_type = 'password' AND is_encrypted = FALSE;

-- Backfill is_public for settings created before the column existed,
-- defaulting non-secret settings to publicly readable.
UPDATE settings
SET is_public = TRUE
WHERE is_public IS NULL AND data_type <> 'password';
