-- =============================================
-- MANUAL MIGRATION FOR SUPABASE
-- =============================================
-- Run this SQL in your Supabase SQL Editor to apply the migration
-- https://sprlwlxjhhmazxpflhnb.supabase.co/project/-/sql
-- =============================================
--
-- FIX: "Some settings failed to update"
--
-- The configuration service selects the `is_encrypted` column when
-- updating a setting, but that column was never created on the
-- `settings` table. As a result every update failed with
-- "Setting not found", surfacing to users as
-- "Some settings failed to update".
--
-- This migration creates the missing column and marks password-typed
-- settings as encrypted so their values are masked in history/audit logs.
-- =============================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;

UPDATE settings
SET is_encrypted = TRUE
WHERE data_type = 'password' AND is_encrypted = FALSE;

UPDATE settings
SET is_public = TRUE
WHERE is_public IS NULL AND data_type <> 'password';

-- Verify
SELECT
  key,
  data_type,
  is_encrypted,
  is_public
FROM settings
ORDER BY category, display_order;
