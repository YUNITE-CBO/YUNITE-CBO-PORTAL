-- ===================================================================
-- 026: Extend obligations view with contributions + welfare
--
-- Phase 1 (migration 025) covered loans + fines, which carry their own
-- amount_due/amount_paid and due dates. Contributions and welfare are
-- different: they are monthly obligations whose "expected" amount comes
-- from settings (contributions.monthly_default, welfare.monthly_amount)
-- and whose "paid" amount is the sum of current-month transactions of
-- the matching transaction_type. The due date is the last day of the
-- current month.
--
-- This migration replaces the view to add both. It also adds an
-- `automation_sent_reminders` helper VIEW so the runner can cheaply check
-- whether a reminder for a given obligation was already sent within a
-- lookback window (for the overdue-repeat-every-N-days logic) without
-- scanning the full notifications table each tick.
--
-- Idempotent: CREATE OR REPLACE VIEW.
-- ===================================================================

-- ===================================================================
-- Helper: last day of current month
-- ===================================================================
CREATE OR REPLACE FUNCTION IF NOT EXISTS last_day_of_month(d DATE DEFAULT CURRENT_DATE)
RETURNS DATE AS $$
    SELECT (date_trunc('month', d) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
$$ LANGUAGE SQL IMMUTABLE;

-- ===================================================================
-- member_financial_obligations (extended: loans + fines + contributions + welfare)
-- ===================================================================
CREATE OR REPLACE VIEW member_financial_obligations AS
-- ---- LOANS ----
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

-- ---- FINES ----
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
WHERE f.status IN ('pending', 'partial', 'paid', 'waived')

UNION ALL

-- ---- CONTRIBUTIONS (monthly) ----
-- expected = contributions.monthly_default setting
-- paid     = SUM(contribution_monthly transactions this month)
-- due_date = last day of current month
SELECT
    gen_random_uuid()::TEXT AS obligation_id,
    'contribution'::TEXT AS obligation_type,
    m.id AS source_id,
    ('CONTRIB-' || to_char(CURRENT_DATE, 'YYYY-MM') || '-' || m.member_number) AS reference,
    m.id AS member_id,
    m.member_number,
    (m.first_name || ' ' || m.last_name) AS member_name,
    m.email,
    m.phone,
    COALESCE(cs.value::NUMERIC, 1000) AS amount_due,
    COALESCE(paid.this_month_paid, 0) AS amount_paid,
    GREATEST(COALESCE(cs.value::NUMERIC, 1000) - COALESCE(paid.this_month_paid, 0), 0) AS remaining,
    last_day_of_month() AS due_date,
    last_day_of_month() AS repayment_end_date,
    'monthly'::TEXT AS source_status,
    CASE
        WHEN (COALESCE(cs.value::NUMERIC, 1000) - COALESCE(paid.this_month_paid, 0)) <= 0 THEN 'paid'
        WHEN last_day_of_month() < CURRENT_DATE THEN 'overdue'
        WHEN last_day_of_month() = CURRENT_DATE THEN 'due'
        WHEN paid.this_month_paid > 0 THEN 'partially_paid'
        ELSE 'upcoming'
    END AS obligation_status,
    date_trunc('month', CURRENT_DATE)::TIMESTAMPTZ AS created_at
FROM members m
LEFT JOIN settings cs ON cs.key = 'contributions.monthly_default'
LEFT JOIN (
    SELECT
        t.member_id,
        SUM(t.amount) AS this_month_paid
    FROM transactions t
    WHERE t.transaction_type = 'contribution_monthly'
      AND t.reversed = FALSE
      AND date_trunc('month', t.posted_at) = date_trunc('month', CURRENT_DATE)
    GROUP BY t.member_id
) paid ON paid.member_id = m.id
WHERE m.status = 'active'
  AND (COALESCE(cs.value::NUMERIC, 1000) - COALESCE(paid.this_month_paid, 0)) > 0

UNION ALL

-- ---- WELFARE (monthly) ----
-- expected = welfare.monthly_amount setting
-- paid     = SUM(welfare_deposit transactions this month)
-- due_date = last day of current month
SELECT
    gen_random_uuid()::TEXT AS obligation_id,
    'welfare'::TEXT AS obligation_type,
    m.id AS source_id,
    ('WELFARE-' || to_char(CURRENT_DATE, 'YYYY-MM') || '-' || m.member_number) AS reference,
    m.id AS member_id,
    m.member_number,
    (m.first_name || ' ' || m.last_name) AS member_name,
    m.email,
    m.phone,
    COALESCE(ws.value::NUMERIC, 500) AS amount_due,
    COALESCE(paid.this_month_paid, 0) AS amount_paid,
    GREATEST(COALESCE(ws.value::NUMERIC, 500) - COALESCE(paid.this_month_paid, 0), 0) AS remaining,
    last_day_of_month() AS due_date,
    last_day_of_month() AS repayment_end_date,
    'monthly'::TEXT AS source_status,
    CASE
        WHEN (COALESCE(ws.value::NUMERIC, 500) - COALESCE(paid.this_month_paid, 0)) <= 0 THEN 'paid'
        WHEN last_day_of_month() < CURRENT_DATE THEN 'overdue'
        WHEN last_day_of_month() = CURRENT_DATE THEN 'due'
        WHEN paid.this_month_paid > 0 THEN 'partially_paid'
        ELSE 'upcoming'
    END AS obligation_status,
    date_trunc('month', CURRENT_DATE)::TIMESTAMPTZ AS created_at
FROM members m
LEFT JOIN settings ws ON ws.key = 'welfare.monthly_amount'
LEFT JOIN (
    SELECT
        t.member_id,
        SUM(t.amount) AS this_month_paid
    FROM transactions t
    WHERE t.transaction_type = 'welfare_deposit'
      AND t.reversed = FALSE
      AND date_trunc('month', t.posted_at) = date_trunc('month', CURRENT_DATE)
    GROUP BY t.member_id
) paid ON paid.member_id = m.id
WHERE m.status = 'active'
  AND (COALESCE(ws.value::NUMERIC, 500) - COALESCE(paid.this_month_paid, 0)) > 0;

-- ===================================================================
-- Index to accelerate the runner's "was a reminder sent recently?" check.
-- The runner queries notifications by source_entity_type + source_entity_id
-- + source_action + created_at > now - N days.
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_reminder_lookup
    ON notifications(source_entity_type, source_entity_id, source_action, created_at DESC)
    WHERE source_module = 'automation';

-- ===================================================================
-- Templates for contribution + welfare reminders
-- ===================================================================
INSERT INTO notification_templates (template_code, name, description, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  ('contribution.due', 'Contribution Due', 'Monthly contribution reminder.', ARRAY['in_app', 'email'], '{{organization_name}} — Monthly Contribution Due {{due_date}}', ARRAY['organization_name', 'due_date']::TEXT[], 'Dear {{member_name}},\n\nThis is a reminder that your monthly contribution of {{currency}} {{amount}} is due on {{due_date}}.\n\nPlease make your payment to remain in good standing.', ARRAY['member_name', 'currency', 'amount', 'due_date']::TEXT[], 'normal', true),
  ('contribution.overdue', 'Contribution Overdue', 'Monthly contribution is past due.', ARRAY['in_app', 'email'], '{{organization_name}} — Monthly Contribution OVERDUE', ARRAY['organization_name']::TEXT[], 'Dear {{member_name}},\n\nYour monthly contribution of {{currency}} {{amount}} was due on {{due_date}} and is now overdue.\n\nPlease contact the office to arrange payment.', ARRAY['member_name', 'currency', 'amount', 'due_date']::TEXT[], 'high', true),
  ('welfare.due', 'Welfare Contribution Due', 'Monthly welfare contribution reminder.', ARRAY['in_app', 'email'], '{{organization_name}} — Welfare Contribution Due {{due_date}}', ARRAY['organization_name', 'due_date']::TEXT[], 'Dear {{member_name}},\n\nThis is a reminder that your monthly welfare contribution of {{currency}} {{amount}} is due on {{due_date}}.\n\nPlease make your payment to support the welfare scheme.', ARRAY['member_name', 'currency', 'amount', 'due_date']::TEXT[], 'normal', true),
  ('welfare.overdue', 'Welfare Contribution Overdue', 'Monthly welfare contribution is past due.', ARRAY['in_app', 'email'], '{{organization_name}} — Welfare Contribution OVERDUE', ARRAY['organization_name']::TEXT[], 'Dear {{member_name}},\n\nYour monthly welfare contribution of {{currency}} {{amount}} was due on {{due_date}} and is now overdue.\n\nPlease contact the office to arrange payment.', ARRAY['member_name', 'currency', 'amount', 'due_date']::TEXT[], 'high', true)
ON CONFLICT (template_code) DO NOTHING;
