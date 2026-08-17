-- ===================================================================
-- 040: Member Pre-Registration & Smart Auto-Fill System
--
-- A pre-registration / data-collection layer that sits AHEAD of the
-- existing member registration engine. Prospective members submit their
-- information through a PUBLIC form (/register/member). Those submissions
-- are stored here as PENDING applications — NO member, account, workspace,
-- or financial record is created at submission time.
--
-- An administrator later opens the EXISTING "Register Member" form,
-- clicks "Auto-fill from Submitted Registrations", picks an applicant, and
-- the existing registration form is populated. The admin reviews/edits and
-- clicks the EXISTING "Register Member" button → the EXISTING
-- MemberRegistrationService.register() runs (the single source of truth).
-- On success the submission is marked REGISTERED and linked to the new
-- member so it can never be registered twice.
--
-- The existing registration engine is NOT duplicated. This table only
-- holds the collected applicant data + lifecycle + audit fields.
--
-- Idempotent: safe to re-run.
-- ===================================================================

-- 1. The pre-registration submission table.
-- Mirrors the EXACT field set captured by the existing registration form
-- (src/app/api/members/route.ts registrationSchema +
--  MemberRegistrationData) so the public form and the auto-fill mapping can
-- never silently drift from what the real registration engine accepts.
CREATE TABLE IF NOT EXISTS member_registration_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Human-readable reference shown to the applicant (for follow-up).
    submission_reference TEXT UNIQUE NOT NULL,

    -- ===== Personal Information (mirrors members.* columns) =====
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    alt_phone TEXT,
    alt_email TEXT,
    id_number TEXT,
    kra_pin TEXT,
    date_of_birth TEXT,
    gender TEXT,
    marital_status TEXT,
    nationality TEXT,

    -- ===== Contact Information =====
    physical_address TEXT,
    postal_address TEXT,

    -- ===== Employment Information =====
    occupation TEXT,
    employer TEXT,
    employer_address TEXT,

    -- ===== Next of Kin =====
    next_of_kin_name TEXT,
    next_of_kin_phone TEXT,
    next_of_kin_relationship TEXT,

    -- ===== Emergency Contact =====
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,

    -- ===== Lifecycle =====
    -- submitted  -> waiting for admin
    -- reviewing  -> admin opened/auto-filled it
    -- registered -> linked to a real member (terminal-success)
    -- rejected   -> admin declined (terminal)
    -- archived   -> retained for audit, out of the queue
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'reviewing', 'registered', 'rejected', 'archived')),

    -- ===== Linkage to the real member once registered =====
    registered_member_id UUID,
    registered_member_number TEXT,
    registered_at TIMESTAMPTZ,
    registered_by UUID, -- the admin user who completed registration

    -- ===== Duplicate-detection signal (computed at submission time) =====
    -- True if an existing member already shares id_number / phone / email.
    -- Surfaced to the admin during auto-fill as a "possible duplicate" warning.
    duplicate_flagged BOOLEAN DEFAULT FALSE,
    duplicate_match JSONB, -- { id_number?: member_number, phone?: member_number, email?: member_number }

    -- ===== Audit =====
    -- The original submitted payload is preserved VERBATIM (even if the admin
    -- edits fields before registering) for accountability. submitted_data
    -- never changes after insert.
    submitted_data JSONB NOT NULL,
    submission_source TEXT DEFAULT 'public_form',
    ip_address TEXT,
    user_agent TEXT,

    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    rejection_reason TEXT,
    admin_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for the admin queue + search (name/id/phone/email/reference).
CREATE INDEX IF NOT EXISTS idx_mrs_status ON member_registration_submissions(status);
CREATE INDEX IF NOT EXISTS idx_mrs_created_at ON member_registration_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrs_id_number ON member_registration_submissions(id_number);
CREATE INDEX IF NOT EXISTS idx_mrs_phone ON member_registration_submissions(phone);
CREATE INDEX IF NOT EXISTS idx_mrs_email ON member_registration_submissions(email);
CREATE INDEX IF NOT EXISTS idx_mrs_registered_member_id ON member_registration_submissions(registered_member_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_mrs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_mrs_updated_at ON member_registration_submissions;
CREATE TRIGGER set_mrs_updated_at
    BEFORE UPDATE ON member_registration_submissions
    FOR EACH ROW
    EXECUTE FUNCTION trg_mrs_set_updated_at();

-- 2. Configuration category + settings for the public registration URL.
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order)
VALUES ('registration', 'Member Registration', 'Public pre-registration form URL and bulk-registration helper settings', 'user-plus', '#0B2A4A', 16)
ON CONFLICT (code) DO NOTHING;

-- registration.url is intentionally empty by default; the app derives the
-- public URL from the request origin so it is always correct per deployment.
-- The setting exists so admins can see/copy it from Settings and toggle
-- whether the public form is open.
INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('registration.public_enabled', 'true', 'registration', 'Open the public member pre-registration form (/register/member). When OFF, the public form refuses new submissions.', 'boolean', true, 1, 'Turn this ON to let prospective members submit their information through the shareable registration URL. Submissions are stored as pending applications — they do NOT create members until an administrator registers them.'),
  ('registration.url', '', 'registration', 'The public member pre-registration URL (derived from this deployment). Share this with prospective members.', 'text', true, 2, 'Copy this link and share it (or scan the QR code) so prospective members can submit their information. A submission does not register a member — it waits for administrator review.'),
  ('registration.notify_admins', 'true', 'registration', 'Notify administrators (in-app) when a new pre-registration submission arrives.', 'boolean', false, 3, 'When ON, every new public submission creates an in-app notification for admins so the queue is processed promptly.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  data_type = EXCLUDED.data_type,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  help_text = EXCLUDED.help_text;

UPDATE settings s
SET config_category_id = cc.id
FROM configuration_categories cc
WHERE cc.code = 'registration' AND s.category = 'registration' AND s.config_category_id IS NULL;

-- 3. Notification templates.
-- (a) admin.member_submission_received — notifies admins of a new applicant.
-- (b) applicant.submission_received — confirmation copy for the applicant
--     (best-effort email; makes clear they are NOT yet a member).
INSERT INTO notification_templates (template_code, name, description, category_id, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  (
    'admin.member_submission_received',
    'New Member Registration Submission',
    'Notifies administrators that a prospective member submitted the public pre-registration form.',
    (SELECT id FROM notification_categories WHERE code = 'member'),
    ARRAY['in_app']::TEXT[],
    'New member registration submission from {{applicant_name}}',
    ARRAY['applicant_name']::TEXT[],
    'A prospective member has submitted their information through the public registration form and is awaiting processing.

Applicant: {{applicant_name}}
Phone: {{phone}}
Email: {{email}}
ID Number: {{id_number}}
Submitted: {{submitted_at}}
Reference: {{submission_reference}}

Open Members → Register Member → Auto-fill from Submitted Registrations to process this application.',
    ARRAY['applicant_name','phone','email','id_number','submitted_at','submission_reference']::TEXT[],
    'normal',
    TRUE
  ),
  (
    'applicant.submission_received',
    'Registration Information Received',
    'Confirmation sent to an applicant after they submit the public pre-registration form. Makes clear they are not yet a registered member.',
    (SELECT id FROM notification_categories WHERE code = 'member'),
    ARRAY['email']::TEXT[],
    'Your registration information has been received — {{org_name}}',
    ARRAY['org_name']::TEXT[],
    'Hello {{applicant_name}},

Thank you for submitting your information to {{org_name}}.

Your submission has been received and is awaiting processing by our administrators.

Reference: {{submission_reference}}

IMPORTANT: This submission does NOT automatically make you a registered member. A YUNITE administrator will review your information and complete your registration. You will be contacted once your membership has been processed.

If you did not submit this information, please ignore this message.

— {{org_name}}',
    ARRAY['applicant_name','org_name','submission_reference']::TEXT[],
    'normal',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;
