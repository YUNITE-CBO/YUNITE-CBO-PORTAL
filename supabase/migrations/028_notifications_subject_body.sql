-- ============================================
-- MIGRATION 028: Reconcile notifications subject/body columns
-- ============================================
-- Context: migration 004 created `notifications` with legacy columns
-- `title`/`message` (NOT NULL). Migration 005 intended `subject`/`body` but
-- its `CREATE TABLE IF NOT EXISTS` was skipped (table already existed) and
-- its ALTER block never added `subject`/`body`. The notification service +
-- frontend were written against `subject`/`body`, so notification content
-- rendered blank in the bell dropdown and notifications page (only the
-- unread count, derived from `status`, worked).
--
-- This migration:
--   1. Adds `subject`/`body` columns (if missing).
--   2. Backfills them from the legacy `title`/`message` columns.
--   3. Adds a trigger to keep `title`/`message` in sync with `subject`/`body`
--      on INSERT/UPDATE so any legacy consumer still reading `title`/`message`
--      continues to work, while the canonical columns are `subject`/`body`.
-- Idempotent: safe to re-run.

-- 1. Add canonical subject/body columns
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;

-- 2. Backfill from legacy columns where subject/body are NULL
UPDATE notifications
SET subject = title
WHERE subject IS NULL AND title IS NOT NULL;

UPDATE notifications
SET body = message
WHERE body IS NULL AND message IS NOT NULL;

-- 3. Drop any previous version of the sync trigger before (re)creating
DROP TRIGGER IF EXISTS sync_notifications_title_message ON notifications;
DROP FUNCTION IF EXISTS sync_notifications_title_message();

-- Keep legacy title/message columns populated from subject/body so older
-- code paths that still read title/message keep working. subject/body are
-- the canonical columns going forward.
CREATE OR REPLACE FUNCTION sync_notifications_title_message()
RETURNS TRIGGER AS $$
BEGIN
    NEW.title := NEW.subject;
    NEW.message := NEW.body;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_notifications_title_message
    BEFORE INSERT OR UPDATE OF subject, body ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION sync_notifications_title_message();

-- Helpful lookup for the bell + history views
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status_created
    ON notifications(recipient_id, recipient_type, status, created_at DESC);
