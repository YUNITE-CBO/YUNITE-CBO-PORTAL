-- ===================================================================
-- 044: Member Registration Acknowledgement Email
--
-- Closes the gap where a newly registered member never received an
-- acknowledgement: the member.registered event mapping only notified
-- admins (recipient_type 'all_admins' + the admin-facing
-- member.registered template). A second event mapping now targets the
-- MEMBER with this new member-facing template
-- (member.registration_confirmation), so official registration emails
-- an acknowledgement (member number + registration date) to the member.
--
-- Pair this with the pre-registration acknowledgement
-- (applicant.submission_received, migration 040) which confirms receipt
-- of the applicant's submitted information BEFORE they are a member.
--
-- Idempotent: safe to re-run.
-- ===================================================================

INSERT INTO notification_templates (template_code, name, description, category_id, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  (
    'member.registration_confirmation',
    'Member Registration Confirmation',
    'Acknowledgement sent to a member immediately after an administrator officially registers them. Confirms membership details (member number, registration date).',
    (SELECT id FROM notification_categories WHERE code = 'member'),
    ARRAY['in_app', 'email']::TEXT[],
    'Welcome to {{organization_name}} — your registration is confirmed',
    ARRAY['organization_name']::TEXT[],
    'Dear {{member_name}},

Thank you — your membership registration with {{organization_name}} has been completed.

Your membership details:
Member Number: {{member_number}}
Registration Date: {{registration_date}}
Phone: {{phone}}
Email: {{email}}

Please keep your member number safe — you will need it to access member services and for any membership inquiries.

If any of the details above are incorrect, please contact the organization office.

— {{organization_name}}',
    ARRAY['member_name', 'member_number', 'organization_name', 'registration_date', 'phone', 'email']::TEXT[],
    'normal',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;
