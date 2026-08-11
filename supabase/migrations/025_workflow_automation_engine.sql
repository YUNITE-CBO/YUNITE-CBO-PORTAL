-- ===================================================================
-- 025: Workflow & Automation Engine (Phase 1 - Foundation)
--
-- The notification stack (migrations 005/012) is rich but SILENT:
-- scheduleService.processDueSchedules() and statementService.generate()
-- are fully written yet have NO runtime caller, so schedules/statements
-- never fire. This migration lays the foundation for a real engine:
--
--   1. Reconcile the 005/012 schema conflicts with idempotent ALTERs so
--      the existing services (statement/event/notification/schedule) work
--      regardless of which migration "won" on the live DB.
--   2. automation_runs  -> unified history of every automation tick
--      (statements generated, emails sent, skipped-no-email, errors).
--   3. automation_locks -> row-level mutex so overlapping cron ticks
--      (Render free-tier can overlap on cold starts) cannot double-fire.
--   4. member_financial_obligations -> VIEW centralizing loan + fine
--      obligations with due/upcoming/overdue/partial/paid/waived status
--      (contributions/welfare added in later phases).
--   5. workflow.* settings -> toggles + configurable reminder lead times,
--      seeded under the existing 'workflow' config category (migration 007).
--   6. Default notification_schedules for weekly/monthly statements so the
--      clock has something to fire as soon as the runner is wired.
--
-- Idempotent throughout (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Run via Supabase SQL Editor.
-- ===================================================================

-- ===================================================================
-- PART 1: SCHEMA RECONCILIATION (005 vs 012 conflicts)
-- Services assume the richer 005 column shape. Guarantee those columns
-- exist; never drop anything.
-- ===================================================================

-- notification_statements: needs recipient_email, recipient_name, title,
-- summary, generated_data, schedule_id, schedule_run_id, status flow.
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}';
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS generated_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES notification_schedules(id);
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS schedule_run_id TEXT;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE notification_statements ADD COLUMN IF NOT EXISTS created_by UUID;

-- notification_event_logs: needs event_id, status, received_at, processed_at,
-- created_notifications. source_module is NOT NULL in 005 but nullable in
-- 012; do NOT add a NOT NULL constraint (012-based rows may exist without it).
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS event_id TEXT UNIQUE;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS event_action TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS source_module TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS processed_data JSONB;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS actor_type TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS matched_templates UUID[] DEFAULT '{}';
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS created_notifications UUID[] DEFAULT '{}';
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE notification_event_logs ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- notification_preferences: needs owner_type/owner_id (005 shape).
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS owner_type TEXT;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{"in_app": true, "email": true, "sms": false}';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS enabled_categories UUID[] DEFAULT '{}';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS disabled_categories UUID[] DEFAULT '{}';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_frequency TEXT DEFAULT 'immediate';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_format TEXT DEFAULT 'html';

-- email_queue: 005 shape (to_email etc.) is the canonical one used by services.
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS to_name TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS html_body TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS text_body TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- notifications: 005 column set used by notification.service.ts.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_ref TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES notification_templates(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_code TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rendered_variables JSONB DEFAULT '{}';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_module TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_entity_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_entity_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_action TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_name TEXT;

-- ===================================================================
-- PART 2: automation_runs - unified automation history
-- ===================================================================
CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type TEXT NOT NULL,                       -- 'tick' | 'schedule' | 'obligations' | 'statements' | 'forecast' | 'alerts' | 'email_queue'
    status TEXT NOT NULL DEFAULT 'running',       -- 'running' | 'completed' | 'failed' | 'skipped'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    trigger TEXT DEFAULT 'cron',                  -- 'cron' | 'manual'
    items_processed INTEGER DEFAULT 0,
    notifications_created INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    emails_skipped INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    details JSONB DEFAULT '{}',                   -- per-step breakdown, skipped reasons, etc.
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_type ON automation_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at DESC);

-- ===================================================================
-- PART 3: automation_locks - mutex to prevent overlapping cron ticks
-- ===================================================================
CREATE TABLE IF NOT EXISTS automation_locks (
    id TEXT PRIMARY KEY,                          -- logical lock name, e.g. 'tick'
    locked_by UUID,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL               -- stale locks are ignorable
);

-- ===================================================================
-- PART 4: member_financial_obligations - centralized obligations view
-- Phase 1 covers loans + fines (both carry their own amount_due/amount_paid
-- and due dates). Contributions/welfare added in later phases via UNION.
-- Status derivation:
--   paid          -> remaining = 0
--   waived        -> fines.status = 'waived'
--   overdue       -> due_date < today AND remaining > 0
--   partially_paid-> 0 < amount_paid < amount
--   due           -> due_date = today AND remaining > 0
--   upcoming      -> due_date > today AND remaining > 0
-- ===================================================================
CREATE OR REPLACE VIEW member_financial_obligations AS
SELECT
    gen_random_uuid()::TEXT AS obligation_id,
    'loan'::TEXT AS obligation_type,
    l.id AS source_id,
    l.loan_number AS reference,
    l.member_id,
    m.member_number,
    (m.first_name || ' ' || m.last_name) AS member_name,
    m.email,
    m.phone,
    l.monthly_repayment AS amount_due,
    l.amount_paid AS amount_paid,
    GREATEST(l.amount_due - l.amount_paid, 0) AS remaining,
    l.repayment_start_date AS due_date,
    l.repayment_end_date,
    l.status AS source_status,
    CASE
        WHEN (l.amount_due - l.amount_paid) <= 0 THEN 'paid'
        WHEN l.status = 'defaulted' THEN 'overdue'
        WHEN l.repayment_end_date IS NOT NULL AND l.repayment_end_date < CURRENT_DATE THEN 'overdue'
        WHEN l.repayment_start_date IS NOT NULL AND l.repayment_start_date = CURRENT_DATE THEN 'due'
        WHEN l.repayment_start_date IS NOT NULL AND l.repayment_start_date > CURRENT_DATE THEN 'upcoming'
        WHEN l.amount_paid > 0 THEN 'partially_paid'
        ELSE 'due'
    END AS obligation_status,
    l.created_at
FROM loans l
JOIN members m ON m.id = l.member_id
WHERE l.status IN ('approved', 'disbursed', 'active', 'defaulted')

UNION ALL

SELECT
    gen_random_uuid()::TEXT AS obligation_id,
    'fine'::TEXT AS obligation_type,
    f.id AS source_id,
    f.fine_number AS reference,
    f.member_id,
    m.member_number,
    (m.first_name || ' ' || m.last_name) AS member_name,
    m.email,
    m.phone,
    f.amount AS amount_due,
    f.amount_paid AS amount_paid,
    GREATEST(f.amount - f.amount_paid, 0) AS remaining,
    f.due_date,
    f.due_date AS repayment_end_date,
    f.status AS source_status,
    CASE
        WHEN f.status = 'waived' THEN 'waived'
        WHEN (f.amount - f.amount_paid) <= 0 THEN 'paid'
        WHEN f.due_date IS NOT NULL AND f.due_date < CURRENT_DATE THEN 'overdue'
        WHEN f.due_date IS NOT NULL AND f.due_date = CURRENT_DATE THEN 'due'
        WHEN f.due_date IS NOT NULL AND f.due_date > CURRENT_DATE THEN 'upcoming'
        WHEN f.amount_paid > 0 THEN 'partially_paid'
        ELSE 'due'
    END AS obligation_status,
    f.created_at
FROM fines f
JOIN members m ON m.id = f.member_id
WHERE f.status IN ('pending', 'partial', 'paid', 'waived');

-- ===================================================================
-- PART 5: workflow.* configuration settings (toggles + lead times)
-- Reuse the existing settings table + 'workflow' config category.
-- ===================================================================
INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('workflow.automation.enabled', 'true', 'workflow', 'Master switch for the Workflow & Automation Engine. When off, the cron tick still runs but performs no actions.', 'boolean', false, 1, 'Disable to pause all automated reminders, statements, and alerts.'),
  ('workflow.channels.in_app', 'true', 'workflow', 'Send in-app notifications for automated events.', 'boolean', false, 2, 'Bell-icon notifications visible in the portal.'),
  ('workflow.channels.email', 'true', 'workflow', 'Send email notifications for automated events. Requires SMTP/Gmail configured.', 'boolean', false, 3, 'Disabled members still get in-app; emails are skipped with a logged reason.'),
  ('workflow.reminders.loan_payment', 'true', 'workflow', 'Loan payment reminders (upcoming + overdue).', 'boolean', false, 10, ''),
  ('workflow.reminders.fines', 'true', 'workflow', 'Outstanding fine reminders.', 'boolean', false, 11, ''),
  ('workflow.reminders.contributions', 'true', 'workflow', 'Savings/membership contribution reminders.', 'boolean', false, 12, ''),
  ('workflow.reminders.welfare', 'true', 'workflow', 'Welfare contribution reminders.', 'boolean', false, 13, ''),
  ('workflow.reminders.first_lead_days', '7', 'workflow', 'Days before due date to send the first reminder.', 'number', false, 20, 'Default 7 days.'),
  ('workflow.reminders.second_lead_days', '3', 'workflow', 'Days before due date to send the second reminder.', 'number', false, 21, 'Default 3 days.'),
  ('workflow.reminders.final_lead_days', '1', 'workflow', 'Days before due date to send the final reminder.', 'number', false, 22, 'Default 1 day.'),
  ('workflow.reminders.overdue_repeat_days', '7', 'workflow', 'How often (in days) to repeat an overdue reminder after the due date passes.', 'number', false, 23, 'Default every 7 days.'),
  ('workflow.statements.weekly', 'true', 'workflow', 'Generate and email weekly member financial statements.', 'boolean', false, 30, ''),
  ('workflow.statements.monthly', 'true', 'workflow', 'Generate and email monthly member financial statements (members get their own; super admin gets the org summary).', 'boolean', false, 31, ''),
  ('workflow.statements.weekly_day', '1', 'workflow', 'Day of week to run weekly statements (0=Sun ... 6=Sat).', 'number', false, 32, 'Default Monday (1).'),
  ('workflow.statements.monthly_day', '1', 'workflow', 'Day of month to run monthly statements (1-28).', 'number', false, 33, 'Default 1st of month.'),
  ('workflow.meetings.notifications', 'true', 'workflow', 'Notify members when a meeting is created/updated.', 'boolean', false, 40, ''),
  ('workflow.meetings.reminders', 'true', 'workflow', 'Send configurable meeting reminders before start time.', 'boolean', false, 41, ''),
  ('workflow.meetings.reminder_offsets', '7d,3d,1d,2h', 'workflow', 'Comma-separated reminder offsets before a meeting. Suffix d=days, h=hours.', 'string', false, 42, 'Default: 7 days, 3 days, 1 day, 2 hours before.'),
  ('workflow.alerts.financial_forecast', 'true', 'workflow', 'Generate and email the 30/90-day financial forecast to super admins.', 'boolean', false, 50, ''),
  ('workflow.alerts.super_admin', 'true', 'workflow', 'Send super-admin alert-center notifications (overdue loans, low cash position, default risk).', 'boolean', false, 51, ''),
  ('workflow.alerts.automation_failures', 'true', 'workflow', 'Notify super admins when an automation run fails or emails fail to send.', 'boolean', false, 52, '')
ON CONFLICT (key) DO NOTHING;

-- Link all workflow settings to the 'workflow' configuration category.
UPDATE settings s
SET config_category_id = cc.id
FROM configuration_categories cc
WHERE cc.code = 'workflow' AND s.category = 'workflow' AND s.config_category_id IS NULL;

-- ===================================================================
-- PART 6: Default notification schedules for statements
-- The runner will create statements from these on the configured cadence.
-- Uses the existing schedule_service infrastructure.
-- ===================================================================
INSERT INTO notification_schedules (
    schedule_code, name, description, schedule_type,
    scheduled_time, timezone, template_id, recipient_type,
    recipient_filter, is_active, next_run_at
)
SELECT
    'weekly_member_statements',
    'Weekly Member Financial Statements',
    'Auto-generated weekly member financial statement per active member, emailed when an address is on file.',
    'weekly', '08:00', 'Africa/Nairobi', NULL, 'active_members', '{}'::JSONB, true,
    date_trunc('day', NOW())::TIMESTAMPTZ
WHERE NOT EXISTS (SELECT 1 FROM notification_schedules WHERE schedule_code = 'weekly_member_statements');

INSERT INTO notification_schedules (
    schedule_code, name, description, schedule_type,
    scheduled_time, timezone, template_id, recipient_type,
    recipient_filter, is_active, next_run_at
)
SELECT
    'monthly_member_statements',
    'Monthly Member Financial Statements',
    'Auto-generated monthly member financial statement per active member, emailed when an address is on file.',
    'monthly', '08:00', 'Africa/Nairobi', NULL, 'active_members', '{}'::JSONB, true,
    date_trunc('day', NOW())::TIMESTAMPTZ
WHERE NOT EXISTS (SELECT 1 FROM notification_schedules WHERE schedule_code = 'monthly_member_statements');

-- ===================================================================
-- PART 7: Notification templates for the new automation events
-- The existing EVENT_TEMPLATE_MAPPINGS already covers member/loan/fine/
-- contribution lifecycle events. These add the schedule-driven ones.
-- ===================================================================
INSERT INTO notification_templates (template_code, name, description, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  ('statement.weekly', 'Weekly Statement Available', 'Notify a member their weekly financial statement is available.', ARRAY['in_app', 'email'], '{{organization_name}} — Your Weekly Statement ({{period}})', ARRAY['organization_name', 'period']::TEXT[], 'Dear {{member_name}},\n\nYour weekly financial statement for {{period}} is ready.\n\nOpening balance: {{currency}} {{opening_balance}}\nCredits: {{currency}} {{total_credits}}\nDebits: {{currency}} {{total_debits}}\nClosing balance: {{currency}} {{closing_balance}}\n\nYou can view the full statement in your member portal.', ARRAY['member_name', 'period', 'currency', 'opening_balance', 'total_credits', 'total_debits', 'closing_balance']::TEXT[], 'normal', true),
  ('statement.monthly', 'Monthly Statement Available', 'Notify a member their monthly financial statement is available.', ARRAY['in_app', 'email'], '{{organization_name}} — Your Monthly Statement ({{period}})', ARRAY['organization_name', 'period']::TEXT[], 'Dear {{member_name}},\n\nYour monthly financial statement for {{period}} is ready.\n\nOpening balance: {{currency}} {{opening_balance}}\nCredits: {{currency}} {{total_credits}}\nDebits: {{currency}} {{total_debits}}\nClosing balance: {{currency}} {{closing_balance}}\n\nYou can view the full statement in your member portal.', ARRAY['member_name', 'period', 'currency', 'opening_balance', 'total_credits', 'total_debits', 'closing_balance']::TEXT[], 'normal', true),
  ('loan.payment_due', 'Loan Payment Due', 'Upcoming loan repayment reminder.', ARRAY['in_app', 'email'], '{{organization_name}} — Loan Payment Due {{due_date}}', ARRAY['organization_name', 'due_date']::TEXT[], 'Dear {{member_name}},\n\nThis is a reminder that your loan payment of {{currency}} {{amount}} is due on {{due_date}}.\n\nLoan: {{loan_number}}\nPlease make your payment on time to avoid penalties.', ARRAY['member_name', 'currency', 'amount', 'due_date', 'loan_number']::TEXT[], 'high', true),
  ('loan.payment_overdue', 'Loan Payment Overdue', 'Loan repayment is past due.', ARRAY['in_app', 'email'], '{{organization_name}} — Loan Payment OVERDUE', ARRAY['organization_name']::TEXT[], 'Dear {{member_name}},\n\nYour loan payment of {{currency}} {{amount}} was due on {{due_date}} and is now OVERDUE.\n\nLoan: {{loan_number}}\nPlease contact the office immediately to arrange payment.', ARRAY['member_name', 'currency', 'amount', 'due_date', 'loan_number']::TEXT[], 'urgent', true),
  ('fine.outstanding', 'Outstanding Fine', 'A fine remains unpaid past its due date.', ARRAY['in_app', 'email'], '{{organization_name}} — Outstanding Fine {{fine_number}}', ARRAY['organization_name', 'fine_number']::TEXT[], 'Dear {{member_name}},\n\nYou have an outstanding fine of {{currency}} {{amount}} ({{fine_number}}) that was due on {{due_date}}.\n\nReason: {{reason}}\nPlease settle this fine to restore good standing.', ARRAY['member_name', 'currency', 'amount', 'fine_number', 'due_date', 'reason']::TEXT[], 'high', true),
  ('admin.obligation_overdue', 'Member Obligation Overdue', 'Super-admin alert: a member has an overdue financial obligation.', ARRAY['in_app', 'email'], '{{organization_name}} — Overdue: {{member_name}} ({{member_number}})', ARRAY['organization_name', 'member_name', 'member_number']::TEXT[], 'A member has an overdue financial obligation:\n\nMember: {{member_name}} (#{{member_number}})\nType: {{obligation_type}}\nReference: {{reference}}\nAmount: {{currency}} {{amount}}\nDue: {{due_date}}\nStatus: {{obligation_status}}\n\nReview and follow up as needed.', ARRAY['member_name', 'member_number', 'obligation_type', 'reference', 'currency', 'amount', 'due_date', 'obligation_status']::TEXT[], 'high', true),
  ('admin.financial_forecast', 'Financial Forecast', '30/90-day financial forecast for super admins.', ARRAY['in_app', 'email'], '{{organization_name}} — Financial Forecast ({{period}})', ARRAY['organization_name', 'period']::TEXT[], 'Financial forecast for {{period}}:\n\nExpected income: {{currency}} {{expected_income}}\nExpected expenses: {{currency}} {{expected_expenses}}\nExpected loan collections: {{currency}} {{expected_loan_collections}}\nExpected contributions: {{currency}} {{expected_contributions}}\nProjected net position (30d): {{currency}} {{net_30d}}\nProjected net position (90d): {{currency}} {{net_90d}}\n\nNote: This is a forecast, not actual accounting data.', ARRAY['period', 'currency', 'expected_income', 'expected_expenses', 'expected_loan_collections', 'expected_contributions', 'net_30d', 'net_90d']::TEXT[], 'normal', true)
ON CONFLICT (template_code) DO NOTHING;

-- ===================================================================
-- Done. The runner (src/lib/services/automation/runner.service.ts) and
-- /api/cron/automation route wire this to a clock (render.yaml cron).
-- ===================================================================
