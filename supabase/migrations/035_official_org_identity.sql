-- ============================================
-- Migration 035: Official Organization Identity
-- ============================================
-- Ensures the official organization name in Settings is
-- 'YUNITE PAMOJA CBO' (not 'YUNITE CBO') and that the
-- organization registration number / contact fields exist.
--
-- The document engine resolves org identity from these settings rows;
-- the registration number is NEVER invented in code — it comes from here,
-- and documents show a 'Not Configured' indicator when it is blank.
--
-- Idempotent (ON CONFLICT DO UPDATE). Safe to re-run.
-- ============================================

-- Official name: correct any stale 'YUNITE CBO' seed to the full official name.
UPDATE settings
SET value = 'YUNITE PAMOJA CBO',
    data_type = COALESCE(data_type, 'string'),
    help_text = COALESCE(help_text, 'Official organization name')
WHERE key = 'organization.name';

-- Ensure the registration number setting exists (empty by default — never
-- invented; administrators configure the official CBO registration number here).
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'organization.registration_number', '', 'organization', 'string', 2, 'Official CBO registration/certificate number'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.registration_number');

-- Ensure contact settings exist (empty defaults — populated by administrators).
INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'organization.email', '', 'organization', 'string', 3, 'Primary contact email address'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.email');

INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'organization.phone', '', 'organization', 'string', 4, 'Primary contact phone number'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.phone');

INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'organization.address', '', 'organization', 'string', 5, 'Physical address'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.address');

INSERT INTO settings (key, value, category, data_type, display_order, help_text, is_public)
SELECT 'organization.logo_url', '', 'organization', 'string', 6, 'Path/URL to official organization logo image', true
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.logo_url');

INSERT INTO settings (key, value, category, data_type, display_order, help_text)
SELECT 'organization.website', '', 'organization', 'string', 9, 'Official website URL'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'organization.website');
