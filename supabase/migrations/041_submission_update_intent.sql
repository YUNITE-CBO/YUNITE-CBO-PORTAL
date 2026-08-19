-- ===================================================================
-- 041: Pre-Registration Update Intent + Duplicate Rejection
--
-- Extends the member pre-registration layer (migration 040):
--
--   intent            'register' (default) = a NEW applicant
--                     'update'   = the applicant's ID/phone already matches
--                                  an existing member; the public form
--                                  pre-filled the EXISTING record and the
--                                  applicant edited it. An admin later
--                                  applies the changes to that member.
--   existing_member_id  The member an 'update' submission targets.
--   update_applied_at   When an admin applied the update to the member.
--   update_applied_by   Admin user who applied it.
--
-- Duplicate rejection (id_number / phone) is enforced in the service
-- layer (member-registration-submission.service.ts) — a 'register'
-- submission matching an existing member is refused with 409 so the
-- applicant uses the update flow instead of creating a duplicate profile.
--
-- Idempotent: safe to re-run.
-- ===================================================================

ALTER TABLE member_registration_submissions
    ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'register';

ALTER TABLE member_registration_submissions
    ADD COLUMN IF NOT EXISTS existing_member_id UUID;

ALTER TABLE member_registration_submissions
    ADD COLUMN IF NOT EXISTS update_applied_at TIMESTAMPTZ;

ALTER TABLE member_registration_submissions
    ADD COLUMN IF NOT EXISTS update_applied_by TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'member_registration_submissions_intent_check'
    ) THEN
        ALTER TABLE member_registration_submissions
            ADD CONSTRAINT member_registration_submissions_intent_check
            CHECK (intent IN ('register', 'update'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mrs_intent
    ON member_registration_submissions (intent);

CREATE INDEX IF NOT EXISTS idx_mrs_existing_member_id
    ON member_registration_submissions (existing_member_id)
    WHERE existing_member_id IS NOT NULL;
