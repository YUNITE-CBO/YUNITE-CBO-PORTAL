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

-- Notifications that were flipped to 'failed' purely by the email channel
-- (before the status decoupling fix) are moved back to 'queued' so a
-- successful resend can advance them to 'delivered'. In-app visibility is
-- unaffected: 'queued' notifications render the same as 'sent'.
-- Done in ONE statement so the notification update is scoped to the exact
-- email_queue rows being requeued — a subquery over the whole email_queue
-- table would also match notifications linked to sent/cancelled rows and
-- reset notifications that legitimately failed on another channel.
WITH requeued AS (
  UPDATE email_queue
  SET
    status = 'pending',
    retry_count = 0,
    error_message = NULL,
    scheduled_for = NOW(),
    updated_at = NOW()
  WHERE status = 'failed'
  RETURNING notification_id
)
UPDATE notifications
SET status = 'queued'
WHERE status = 'failed'
  AND id IN (SELECT notification_id FROM requeued WHERE notification_id IS NOT NULL);
