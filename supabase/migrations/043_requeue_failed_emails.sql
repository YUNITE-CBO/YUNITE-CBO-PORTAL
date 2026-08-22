-- ============================================================================
-- Migration 043: Requeue failed email_queue rows after delivery-engine fix
-- ============================================================================
-- Root cause of the backlog: a single stray GOOGLE_* env var made
-- isGmailApiConfigured() return true, so every email was routed to an
-- unconfigured Gmail API, returned NOT_CONFIGURED, and was marked permanently
-- failed with no SMTP fallback. The delivery engine now requires a COMPLETE
-- Gmail credential set, falls back to SMTP on any Gmail failure, and honors
-- scheduled_for on retries. This migration gives the already-failed rows a
-- clean slate so the fixed pipeline re-delivers them automatically on the
-- next automation tick (or via Email Queue -> Retry Failed).
-- Idempotent: only touches rows still in 'failed' state.
-- ============================================================================

UPDATE email_queue
SET
  status = 'pending',
  retry_count = 0,
  error_message = NULL,
  scheduled_for = NOW(),
  updated_at = NOW()
WHERE status = 'failed';

-- Notifications that were flipped to 'failed' purely by the email channel
-- (before the status decoupling fix) are moved back to 'queued' so a
-- successful resend can advance them to 'delivered'. In-app visibility is
-- unaffected: 'queued' notifications render the same as 'sent'.
UPDATE notifications
SET status = 'queued'
WHERE status = 'failed'
  AND id IN (SELECT notification_id FROM email_queue WHERE notification_id IS NOT NULL);
