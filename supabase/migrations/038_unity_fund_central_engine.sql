-- 038_unity_fund_central_engine.sql
--
-- YUNITE PAMOJA CBO — UNITY FUND CENTRAL FINANCIAL ENGINE
--
-- The Unity Fund is the organization-level reserve/account through which
-- organization funds are accumulated and organization expenses are handled.
-- It is NOT a member account. Member savings/shares/wallet remain member
-- money; the Unity Fund is organization money.
--
-- ARCHITECTURE DECISION (spec §11, §20, §22, §25):
--   The existing `transactions` table is the AUTHORITATIVE financial ledger.
--   We do NOT duplicate it. Instead:
--     * ACTUAL org inflows from existing sources (contributions, welfare,
--       fines, loan interest) are DERIVED from the authoritative ledger by
--       the UnityFundEngine (no second write — idempotent by construction).
--     * Genuinely new org-level sources that have no existing table
--       (donations, grants, organization loans, project income, investment
--       income, authorized expenditures) get their OWN authoritative domain
--       tables here. These ARE the source records; the engine reads them.
--     * PENDING receivables are derived from the existing
--       `member_financial_obligations` view + pending columns on the new
--       tables — NEVER added to actual cash.
--
-- CRITICAL ACCOUNTING RULE (spec §1-§4, RULE 1-2):
--   Pending money is NOT actual money. A pending contribution/fine/welfare/
--   interest/donation/grant is a receivable, not cash. Only actually
--   received/posted funds affect the actual Unity Fund balance.
--
-- ORGANIZATION LOANS (spec §5, §28, §40, RULE 13-14):
--   An organization loan received increases actual Unity Fund cash AND
--   creates an organization LIABILITY. It is NEVER classified as income.
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT).

-- ===================================================================
-- 1. UNITY FUND CONFIGURATION CATEGORY + SETTINGS
-- ===================================================================
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order)
VALUES ('unity_fund', 'Unity Fund', 'Organization-level reserve, sources, expenditures, and reconciliation', 'shield', '#0B2A4A', 16)
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('unity_fund.enabled', 'true', 'unity_fund', 'Master switch for the Unity Fund engine. When ON, the Unity Fund is the authoritative organization-level financial accumulator.', 'boolean', false, 1, 'The Unity Fund accumulates organization money (contributions, welfare, fines, loan interest, donations, grants, project income) and tracks organization expenditures and liabilities.'),
  ('unity_fund.project_profit_org_share', '100', 'unity_fund', 'Percentage of organization-owned project profit allocated to the Unity Fund (default 100%). Joint projects use the agreed 50/50 split recorded per project.', 'number', false, 2, 'Organization-owned projects return 100% to Unity Fund. The removed 20%-of-shares annual contribution rule is NOT reintroduced.'),
  ('unity_fund.require_withdrawal_authorization', 'true', 'unity_fund', 'Require a recorded reason + authorization for every Unity Fund expenditure. No direct balance editing.', 'boolean', false, 3, 'Expenditures must carry amount, reason, reference, authorization, and audit trail.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  data_type = EXCLUDED.data_type,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  help_text = EXCLUDED.help_text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'config_category_id') THEN
    UPDATE settings s
    SET config_category_id = (SELECT id FROM configuration_categories WHERE code = 'unity_fund')
    WHERE s.category = 'unity_fund' AND s.config_category_id IS NULL;
  END IF;
END $$;

-- ===================================================================
-- 2. ORGANIZATION-LEVEL SOURCE TABLES (authoritative for new org income)
-- ===================================================================

-- DONATIONS — pledged vs received. A pledge is PENDING; receipt is ACTUAL.
CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_number TEXT UNIQUE NOT NULL,
    donor_name TEXT NOT NULL,
    donor_contact TEXT,
    purpose TEXT,
    pledged_amount DECIMAL(15,2) NOT NULL CHECK (pledged_amount >= 0),
    received_amount DECIMAL(15,2) DEFAULT 0 CHECK (received_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pledged' CHECK (status IN ('pledged','partial','received','reversed','cancelled')),
    received_date TIMESTAMPTZ,
    reference TEXT,
    notes TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (received_amount <= pledged_amount)
);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_received_date ON donations(received_date);

-- GRANTS — approved vs received. Approval is NOT cash.
CREATE TABLE IF NOT EXISTS grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_number TEXT UNIQUE NOT NULL,
    grantor_name TEXT NOT NULL,
    purpose TEXT,
    approved_amount DECIMAL(15,2) NOT NULL CHECK (approved_amount >= 0),
    received_amount DECIMAL(15,2) DEFAULT 0 CHECK (received_amount >= 0),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','committed','received','partial','reversed','returned','cancelled')),
    received_date TIMESTAMPTZ,
    returned_amount DECIMAL(15,2) DEFAULT 0,
    reference TEXT,
    notes TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (received_amount <= approved_amount)
);
CREATE INDEX IF NOT EXISTS idx_grants_status ON grants(status);
CREATE INDEX IF NOT EXISTS idx_grants_received_date ON grants(received_date);

-- ORGANIZATION LOANS — borrowed by the CBO. Received = cash + LIABILITY.
CREATE TABLE IF NOT EXISTS organization_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_loan_number TEXT UNIQUE NOT NULL,
    lender_name TEXT NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount >= 0),
    interest_rate DECIMAL(5,2) DEFAULT 0,
    received_amount DECIMAL(15,2) DEFAULT 0 CHECK (received_amount >= 0),
    repaid_amount DECIMAL(15,2) DEFAULT 0 CHECK (repaid_amount >= 0),
    outstanding_liability DECIMAL(15,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','active','partial','completed','defaulted','cancelled')),
    received_date TIMESTAMPTZ,
    reference TEXT,
    purpose TEXT,
    notes TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organization_loans_status ON organization_loans(status);
CREATE INDEX IF NOT EXISTS idx_organization_loans_received_date ON organization_loans(received_date);

-- UNITY FUND EXPENDITURES — authorized org expenses. No direct balance edits.
CREATE TABLE IF NOT EXISTS unity_fund_expenditures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expenditure_number TEXT UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    category TEXT,
    reference TEXT,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed','cancelled')),
    authorized_by UUID,
    posted_by UUID,
    related_project_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unity_fund_expenditures_status ON unity_fund_expenditures(status);
CREATE INDEX IF NOT EXISTS idx_unity_fund_expenditures_date ON unity_fund_expenditures(transaction_date);

-- ===================================================================
-- 3. LOAN INTEREST SEPARATION
-- Spec §24, RULE 7-8: Loan Principal → Member/loan account; Loan Interest →
-- Unity Fund. Previously a repayment lumped principal+interest into a single
-- member transaction. We now record the INTEREST portion as a Unity Fund
-- actual inflow so it does not inflate a member's personal position.
--
-- `loan_interest_receipts` is the authoritative record of interest actually
-- received by the organization (cash), linked back to the loan + repayment.
-- Accrued-but-unpaid interest stays PENDING (derived from loans.interest_amount
-- minus received).
-- ===================================================================
CREATE TABLE IF NOT EXISTS loan_interest_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT UNIQUE NOT NULL,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    loan_number TEXT NOT NULL,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    interest_amount DECIMAL(15,2) NOT NULL CHECK (interest_amount > 0),
    principal_portion DECIMAL(15,2) NOT NULL DEFAULT 0,
    repayment_transaction_id UUID,  -- link to the source transactions row (idempotency)
    received_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reversed')),
    reversed_at TIMESTAMPTZ,
    reversed_by UUID,
    reversal_reason TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_interest_receipts_loan ON loan_interest_receipts(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_interest_receipts_member ON loan_interest_receipts(member_id);
CREATE INDEX IF NOT EXISTS idx_loan_interest_receipts_status ON loan_interest_receipts(status);
CREATE INDEX IF NOT EXISTS idx_loan_interest_receipts_repayment_txn ON loan_interest_receipts(repayment_transaction_id);

-- ===================================================================
-- 4. UNITY FUND POSITION VIEW (ACTUAL vs PENDING)
-- Single SQL derivation of the organization financial position from all
-- authoritative sources. The TS engine mirrors this; the view is the DB
-- cross-check used by reconciliation.
--
-- ACTUAL = sum of received/posted org inflows - posted expenditures.
-- PENDING = sum of outstanding receivables (never added to actual).
-- ===================================================================
CREATE OR REPLACE VIEW unity_fund_actual_receipts AS
SELECT 'CONTRIBUTION'::TEXT AS source_module, t.id AS source_record_id, t.member_id, t.amount, t.posted_at, t.transaction_ref
FROM transactions t
WHERE t.transaction_type IN ('contribution_monthly','contribution_special','contribution_development')
  AND t.reversed = false
UNION ALL
SELECT 'WELFARE'::TEXT, t.id, t.member_id, t.amount, t.posted_at, t.transaction_ref
FROM transactions t
WHERE t.transaction_type = 'welfare_deposit' AND t.reversed = false
UNION ALL
SELECT 'FINE'::TEXT, t.id, t.member_id, t.amount, t.posted_at, t.transaction_ref
FROM transactions t
WHERE t.transaction_type = 'fine_payment' AND t.reversed = false
UNION ALL
SELECT 'REGISTRATION_FEE'::TEXT, t.id, t.member_id, t.amount, t.posted_at, t.transaction_ref
FROM transactions t
WHERE t.transaction_type = 'registration_fee' AND t.reversed = false
UNION ALL
SELECT 'ANNUAL_FEE'::TEXT, t.id, t.member_id, t.amount, t.posted_at, t.transaction_ref
FROM transactions t
WHERE t.transaction_type = 'annual_fee' AND t.reversed = false
UNION ALL
SELECT 'LOAN_INTEREST'::TEXT, r.id, r.member_id, r.interest_amount AS amount, r.received_date AS posted_at, r.receipt_number AS transaction_ref
FROM loan_interest_receipts r
WHERE r.status = 'received'
UNION ALL
SELECT 'DONATION'::TEXT, d.id, NULL::UUID, d.received_amount, d.received_date, d.donation_number
FROM donations d
WHERE d.status IN ('received','partial') AND d.received_amount > 0
UNION ALL
SELECT 'GRANT'::TEXT, g.id, NULL::UUID, g.received_amount, g.received_date, g.grant_number
FROM grants g
WHERE g.status IN ('received','partial') AND g.received_amount > 0
UNION ALL
SELECT 'ORGANIZATION_LOAN'::TEXT, o.id, NULL::UUID, o.received_amount, o.received_date, o.org_loan_number
FROM organization_loans o
WHERE o.status IN ('received','active','partial','completed') AND o.received_amount > 0;

-- PENDING receivables (never cash). Derived from obligations view + new tables.
CREATE OR REPLACE VIEW unity_fund_pending_receivables AS
SELECT 'CONTRIBUTION'::TEXT AS source_module, obligation_id AS source_record_id, member_id, remaining AS amount, due_date
FROM member_financial_obligations WHERE obligation_type = 'contribution'
UNION ALL
SELECT 'WELFARE'::TEXT, obligation_id, member_id, remaining, due_date
FROM member_financial_obligations WHERE obligation_type = 'welfare'
UNION ALL
SELECT 'FINE'::TEXT, obligation_id, member_id, remaining, due_date
FROM member_financial_obligations WHERE obligation_type = 'fine'
UNION ALL
-- Accrued but unpaid loan interest = loan interest_amount - interest already received
SELECT 'LOAN_INTEREST'::TEXT,
       ('LOAN-INT-' || l.loan_number)::TEXT AS source_record_id,
       l.member_id,
       GREATEST(l.interest_amount - COALESCE(rcv.received, 0), 0) AS amount,
       l.repayment_end_date AS due_date
FROM loans l
LEFT JOIN (
    SELECT loan_id, SUM(interest_amount) AS received
    FROM loan_interest_receipts WHERE status = 'received'
    GROUP BY loan_id
) rcv ON rcv.loan_id = l.id
WHERE l.status IN ('approved','disbursed','active','defaulted')
  AND GREATEST(l.interest_amount - COALESCE(rcv.received, 0), 0) > 0
UNION ALL
SELECT 'DONATION'::TEXT, d.id::TEXT, NULL::UUID, GREATEST(d.pledged_amount - d.received_amount, 0), NULL::DATE
FROM donations d WHERE d.status IN ('pledged','partial') AND d.pledged_amount - d.received_amount > 0
UNION ALL
SELECT 'GRANT'::TEXT, g.id::TEXT, NULL::UUID, GREATEST(g.approved_amount - g.received_amount, 0), NULL::DATE
FROM grants g WHERE g.status IN ('approved','committed','partial') AND g.approved_amount - g.received_amount > 0;

-- ===================================================================
-- 5. RECONCILIATION RUNS (audit trail of reconciliation results)
-- ===================================================================
CREATE TABLE IF NOT EXISTS unity_fund_reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'consistent' CHECK (status IN ('consistent','discrepancy','error')),
    ledger_balance DECIMAL(15,2),
    source_balance DECIMAL(15,2),
    dashboard_balance DECIMAL(15,2),
    report_balance DECIMAL(15,2),
    difference DECIMAL(15,2) DEFAULT 0,
    discrepancies JSONB DEFAULT '[]'::jsonb,
    checks_performed INTEGER DEFAULT 0,
    initiated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unity_fund_reconciliation_status ON unity_fund_reconciliation_runs(status);
CREATE INDEX IF NOT EXISTS idx_unity_fund_reconciliation_created ON unity_fund_reconciliation_runs(created_at);

-- ===================================================================
-- 6. NOTIFICATION TEMPLATES for Unity Fund events
-- ===================================================================
INSERT INTO notification_templates (template_code, name, description, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  ('unity_fund.donation_received', 'Donation Received', 'A donation has been received into the Unity Fund.', ARRAY['in_app'], '{{organization_name}} — Donation Received: {{currency}} {{amount}}', ARRAY['organization_name','currency','amount']::TEXT[], 'A donation of {{currency}} {{amount}} from {{donor_name}} has been received into the Unity Fund.', ARRAY['currency','amount','donor_name']::TEXT[], 'normal', true),
  ('unity_fund.grant_received', 'Grant Received', 'A grant has been received into the Unity Fund.', ARRAY['in_app'], '{{organization_name}} — Grant Received: {{currency}} {{amount}}', ARRAY['organization_name','currency','amount']::TEXT[], 'A grant of {{currency}} {{amount}} from {{grantor_name}} has been received into the Unity Fund.', ARRAY['currency','amount','grantor_name']::TEXT[], 'normal', true),
  ('unity_fund.org_loan_received', 'Organization Loan Received', 'An organization loan has been received (creates a liability).', ARRAY['in_app'], '{{organization_name}} — Organization Loan Received: {{currency}} {{amount}}', ARRAY['organization_name','currency','amount']::TEXT[], 'An organization loan of {{currency}} {{amount}} from {{lender_name}} has been received. This is a liability, not income.', ARRAY['currency','amount','lender_name']::TEXT[], 'high', true),
  ('unity_fund.reconciliation_issue', 'Unity Fund Reconciliation Issue', 'A reconciliation discrepancy was detected.', ARRAY['in_app'], '{{organization_name}} — Unity Fund Reconciliation Discrepancy', ARRAY['organization_name']::TEXT[], 'A Unity Fund reconciliation detected a discrepancy of {{currency}} {{difference}}. Ledger: {{ledger_balance}}, Sources: {{source_balance}}.', ARRAY['currency','difference','ledger_balance','source_balance']::TEXT[], 'high', true)
ON CONFLICT (template_code) DO NOTHING;
