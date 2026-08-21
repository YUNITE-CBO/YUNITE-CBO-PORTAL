-- ===================================================================
-- 042: Settings Categories Completion + Required/Optional Status
--
-- Problems solved:
--
--   1. "Partially Set" mislabeling. The configuration status counted EVERY
--      setting with an empty value as unconfigured, but some settings are
--      optional by design (organization contacts/registration number are
--      deliberately never fabricated; smtp.password comes from env or the
--      Gmail API adapter). A category whose optional fields were left blank
--      showed "Partial" forever even though it was fully set up.
--      Fix: an `is_required` flag on settings. Category status is computed
--      over REQUIRED settings only (see configuration.service.ts).
--
--   2. Dead `smtp.username` key. Migration 007 seeded `smtp.username` but
--      the email service reads `smtp.user` (migration 005). The dead row sat
--      empty and held the SMTP category at "Partial" permanently. Any value
--      an admin entered is preserved into `smtp.user` before the dead row
--      is removed.
--
--   3. Four categories had NO settings rows at all and showed "Not Set":
--      savings, integrations, compliance, branding. This migration seeds
--      them with real, consumed settings:
--        savings      -> enforced by TransactionEngine (min balance /
--                        max withdrawal on savings_withdrawal)
--        integrations -> gmail.* credentials are read by the Gmail API
--                        adapter (previously unseeded, invisible in the UI);
--                        the gmail_api_enabled toggle gates the adapter
--        compliance   -> allow_manual_completion gates the manual-complete
--                        admin action in /api/compliance
--        branding     -> tagline flows into resolveOrgIdentity() and is
--                        rendered on every generated document header
--
-- Idempotent: safe to re-run.
-- ===================================================================

-- -------------------------------------------------------------------
-- PART 1: is_required flag
-- -------------------------------------------------------------------

ALTER TABLE settings ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE;

-- Optional settings: an empty value is a VALID, complete state. These never
-- block a category from showing "Configured".
UPDATE settings SET is_required = FALSE WHERE key IN (
    'organization.registration_number',  -- never fabricated; 'Not Configured' is a valid state
    'organization.email',
    'organization.phone',
    'organization.address',
    'organization.city',
    'organization.website',
    'organization.logo_url',             -- managed by the Media Engine
    'smtp.password'                      -- may be supplied via env / Gmail API adapter
);

-- -------------------------------------------------------------------
-- PART 2: remove the dead smtp.username duplicate (preserve any value)
-- -------------------------------------------------------------------

UPDATE settings s
SET value = u.value, updated_at = NOW()
FROM settings u
WHERE s.key = 'smtp.user'
  AND u.key = 'smtp.username'
  AND (s.value IS NULL OR s.value = '')
  AND u.value IS NOT NULL AND u.value <> '';

DELETE FROM settings WHERE key = 'smtp.username';

-- -------------------------------------------------------------------
-- PART 3: Savings settings (enforced by TransactionEngine)
-- -------------------------------------------------------------------

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'savings.min_balance', '0', 'savings', id, 'number', 1,
    'Minimum balance that must remain in a savings account after a withdrawal (0 = no minimum)'
FROM configuration_categories WHERE code = 'savings'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'savings.max_withdrawal_amount', '0', 'savings', id, 'number', 2,
    'Maximum amount allowed in a single savings withdrawal (0 = unlimited)'
FROM configuration_categories WHERE code = 'savings'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'savings.withdrawal_notice_days', '0', 'savings', id, 'number', 3,
    'Notice period (in days) a member should give before a savings withdrawal (0 = none; policy only)'
FROM configuration_categories WHERE code = 'savings'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'savings.annual_interest_rate', '0', 'savings', id, 'number', 4,
    'Annual interest rate (%) earned on savings balances (0 = no interest; used for projections)'
FROM configuration_categories WHERE code = 'savings'
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------
-- PART 4: Integrations settings (Gmail API credentials are CONSUMED by
-- the Gmail API adapter; previously they were never seeded and could
-- not be managed from Settings at all)
-- -------------------------------------------------------------------

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'integrations.gmail_api_enabled', 'true', 'integrations', id, 'boolean', 1,
    'Send email through the Gmail API adapter (set false to disable Gmail sending)'
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_required)
SELECT 'gmail.client_id', '', 'integrations', id, 'password', 2,
    'Google OAuth2 client ID (falls back to GOOGLE_CLIENT_ID env var)', FALSE
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_required)
SELECT 'gmail.client_secret', '', 'integrations', id, 'password', 3,
    'Google OAuth2 client secret (falls back to GOOGLE_CLIENT_SECRET env var)', FALSE
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_required)
SELECT 'gmail.refresh_token', '', 'integrations', id, 'password', 4,
    'Google OAuth2 refresh token (falls back to GOOGLE_REFRESH_TOKEN env var)', FALSE
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_required)
SELECT 'gmail.sender_email', '', 'integrations', id, 'string', 5,
    'Gmail address to send from (falls back to GOOGLE_SENDER_EMAIL env var)', FALSE
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_required)
SELECT 'gmail.sender_name', '', 'integrations', id, 'string', 6,
    'Display name for Gmail-sent email (falls back to GOOGLE_SENDER_NAME env var)', FALSE
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'integrations.mpesa_enabled', 'false', 'integrations', id, 'boolean', 7,
    'Enable M-Pesa (Daraja) integration for payments (requires credentials configured by an administrator)'
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'integrations.sms_enabled', 'false', 'integrations', id, 'boolean', 8,
    'Enable SMS notifications through an external SMS provider'
FROM configuration_categories WHERE code = 'integrations'
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------
-- PART 5: Compliance settings
-- -------------------------------------------------------------------

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'compliance.require_documents_for_approval', 'true', 'compliance', id, 'boolean', 1,
    'Require all required member documents to be complete before a member can be approved'
FROM configuration_categories WHERE code = 'compliance'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'compliance.allow_manual_completion', 'true', 'compliance', id, 'boolean', 2,
    'Allow administrators to mark compliance complete manually (physical/hardcopy document verification)'
FROM configuration_categories WHERE code = 'compliance'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'compliance.document_expiry_reminder_days', '30', 'compliance', id, 'number', 3,
    'Days before a document expires that a reminder should be sent'
FROM configuration_categories WHERE code = 'compliance'
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------------
-- PART 6: Branding settings (tagline is rendered on every generated
-- document header via resolveOrgIdentity)
-- -------------------------------------------------------------------

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'branding.primary_color', '#0B2A4A', 'branding', id, 'color', 1,
    'Primary brand color (deep navy) used as the identity anchor across the portal'
FROM configuration_categories WHERE code = 'branding'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'branding.accent_color', '#22C55E', 'branding', id, 'color', 2,
    'Accent brand color (luminous green) used for highlights and call-to-action elements'
FROM configuration_categories WHERE code = 'branding'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 'branding.tagline', 'Community-Based Organization', 'branding', id, 'string', 3,
    'Organization tagline rendered under the name on generated documents'
FROM configuration_categories WHERE code = 'branding'
ON CONFLICT (key) DO NOTHING;
