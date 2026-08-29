-- ===================================================================
-- 049: Transaction Rules Engine + Controlled Financial Posting
--
-- Redesigns the YUNITE transactions module from a free-form
-- "Transaction Type + Account Type" pair (which allowed logically
-- incorrect combinations) into a CONTROLLED posting system.
--
-- Every transaction is now described by three dimensions:
--   txn_category   — WHAT HAPPENED     (fee / contribution / savings /
--                    share_purchase / loan / fine / welfare / donation /
--                    grant / expense / adjustment / refund / transfer / other)
--   txn_subtype    — WHAT SPECIFICALLY HAPPENED (e.g. membership_fee)
--   ledger         — WHERE THE MONEY IS ACCOUNTED FOR (e.g. MEMBERSHIP_FEES_INCOME)
--
-- SAFE MIGRATION STRATEGY (spec §20):
--   * The authoritative `transactions` ledger (member_id NOT NULL,
--     account_id NOT NULL, transaction_type CHECK, prevent_null_member_id)
--     is LEFT UNTOUCHED so reports / Unity Fund / loan & fine engines /
--     AI tooling / member deletion all keep working unchanged.
--   * The new controlled columns are ADDED as NULLABLE and populated by the
--     new engine for new-managed postings, AND backfilled here for existing
--     rows using the deterministic legacy mapper (transaction_type -> the
--     new dimensions). No historical data is destroyed; transaction IDs are
--     preserved.
--   * A per-year running transaction_number (TXN-YYYY-#####) is added via a
--     sequence + trigger; existing rows get one backfilled in order of
--     posted_at.
--   * A new `transactions` configuration category + settings rows govern the
--     engine (master switch, duplicate-detection window, whether auto-ledger
--     selection is enforced).
--
-- Idempotent: safe to re-run.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1. Add the new controlled columns (nullable so historical rows remain).
-- -------------------------------------------------------------------
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_category TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_subtype TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS latest_audit JSONB;

-- Indexes for the new search/filter surface (spec §12).
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(txn_category);
CREATE INDEX IF NOT EXISTS idx_transactions_subtype ON transactions(txn_subtype);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger ON transactions(ledger);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_number ON transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_number ON transactions(reference_number);
CREATE INDEX IF NOT EXISTS idx_transactions_posted_by ON transactions(posted_by);

-- -------------------------------------------------------------------
-- 2. CHECK constraints for payment_method and status (nullable columns
--    so rows written before this migration keep NULLs).
-- -------------------------------------------------------------------
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('M_PESA', 'BANK', 'CASH', 'CHEQUE', 'OTHER'));

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('draft', 'pending_review', 'posted', 'reversed', 'voided', 'failed'));

-- -------------------------------------------------------------------
-- 3. Per-year running transaction number.
--    transaction_number = 'TXN-' || year || '-' || zero-padded sequence.
-- -------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS transaction_number_seq START 1;

CREATE OR REPLACE FUNCTION assign_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  IF NEW.transaction_number IS NULL THEN
    v_year := to_char(COALESCE(NEW.transaction_date, NEW.posted_at, NOW()), 'YYYY');
    v_seq := nextval('transaction_number_seq');
    NEW.transaction_number := 'TXN-' || v_year || '-' || lpad(v_seq::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_number ON transactions;
CREATE TRIGGER trg_transaction_number
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION assign_transaction_number();

-- -------------------------------------------------------------------
-- 4. Backfill the new dimensions from the legacy transaction_type.
--    Uses the SAME deterministic mapping as the application rule engine
--    (src/lib/services/transactions/transaction-rules.ts) so the DB
--    agrees with the code. Existing rows that don't match a known legacy
--    type flag as 'other' (never silently guessed as a financial meaning).
-- -------------------------------------------------------------------
UPDATE transactions SET
  txn_category = CASE transaction_type
    WHEN 'savings_deposit' THEN 'savings'
    WHEN 'savings_withdrawal' THEN 'savings'
    WHEN 'savings_adjustment' THEN 'adjustment'
    WHEN 'registration_fee' THEN 'fee'
    WHEN 'annual_fee' THEN 'fee'
    WHEN 'contribution_monthly' THEN 'contribution'
    WHEN 'contribution_special' THEN 'contribution'
    WHEN 'contribution_development' THEN 'contribution'
    WHEN 'welfare_deposit' THEN 'welfare'
    WHEN 'welfare_disbursement' THEN 'welfare'
    WHEN 'fine_posting' THEN 'fine'
    WHEN 'fine_payment' THEN 'fine'
    WHEN 'loan_disbursement' THEN 'loan'
    WHEN 'loan_repayment' THEN 'loan'
    WHEN 'reversal' THEN 'reversal'
    ELSE 'other'
  END,
  txn_subtype = CASE transaction_type
    WHEN 'savings_deposit' THEN 'savings_deposit'
    WHEN 'savings_withdrawal' THEN 'savings_withdrawal'
    WHEN 'savings_adjustment' THEN 'adjustment'
    WHEN 'registration_fee' THEN 'registration_fee'
    WHEN 'annual_fee' THEN 'membership_fee'
    WHEN 'contribution_monthly' THEN 'monthly_savings'
    WHEN 'contribution_special' THEN 'special_contribution'
    WHEN 'contribution_development' THEN 'development_contribution'
    WHEN 'welfare_deposit' THEN 'welfare_deposit'
    WHEN 'welfare_disbursement' THEN 'welfare_disbursement'
    WHEN 'fine_posting' THEN 'late_payment_fine'
    WHEN 'fine_payment' THEN 'late_payment_fine'
    WHEN 'loan_disbursement' THEN 'loan_disbursement'
    WHEN 'loan_repayment' THEN 'loan_principal_repayment'
    WHEN 'reversal' THEN 'adjustment'
    ELSE 'other'
  END,
  ledger = CASE transaction_type
    WHEN 'savings_deposit' THEN 'MEMBER_SAVINGS'
    WHEN 'savings_withdrawal' THEN 'MEMBER_SAVINGS'
    WHEN 'savings_adjustment' THEN 'MEMBER_SAVINGS'
    WHEN 'registration_fee' THEN 'REGISTRATION_FEES_INCOME'
    WHEN 'annual_fee' THEN 'MEMBERSHIP_FEES_INCOME'
    WHEN 'contribution_monthly' THEN 'MEMBER_CONTRIBUTIONS'
    WHEN 'contribution_special' THEN 'UNITY_FUND'
    WHEN 'contribution_development' THEN 'UNITY_FUND'
    WHEN 'welfare_deposit' THEN 'WELFARE_FUND'
    WHEN 'welfare_disbursement' THEN 'WELFARE_FUND'
    WHEN 'fine_posting' THEN 'FINES_OBLIGATION'
    WHEN 'fine_payment' THEN 'FINANCIAL_FINES_INCOME'
    WHEN 'loan_disbursement' THEN 'LOAN_PRINCIPAL_RECEIVABLE'
    WHEN 'loan_repayment' THEN 'LOAN_PRINCIPAL_RECEIVABLE'
    WHEN 'reversal' THEN 'MEMBER_SAVINGS'
    ELSE 'OTHER_INCOME'
  END,
  transaction_date = COALESCE(transaction_date, posted_at, created_at)
WHERE txn_category IS NULL OR txn_subtype IS NULL OR ledger IS NULL;

DO $$
DECLARE
  row RECORD;
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  FOR row IN
    SELECT id, COALESCE(transaction_date, posted_at, created_at) AS dt
    FROM transactions
    WHERE transaction_number IS NULL
    ORDER BY COALESCE(transaction_date, posted_at, created_at) ASC
  LOOP
    v_year := to_char(row.dt, 'YYYY');
    v_seq := nextval('transaction_number_seq');
    UPDATE transactions
      SET transaction_number = 'TXN-' || v_year || '-' || lpad(v_seq::TEXT, 6, '0')
      WHERE id = row.id;
  END LOOP;
END $$;

-- -------------------------------------------------------------------
-- 5. Seed the 'transactions' configuration category + engine settings.
-- -------------------------------------------------------------------
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order)
VALUES ('transactions', 'Transactions', 'Controlled financial transaction posting rules', 'exchange', '#0B2A4A', 16)
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value, category, description, data_type, is_public, display_order, help_text)
VALUES
  ('transactions.rules_enabled', 'true', 'transactions', 'Master switch for the Transaction Rules Engine. When ON, every posting must satisfy a valid (category, sub-type, ledger) combination; invalid combinations are rejected by the API even if the UI is bypassed.', 'boolean', false, 1, 'Turning this OFF restores legacy free-form posting — not recommended.'),
  ('transactions.duplicate_window_minutes', '10', 'transactions', 'Duplicate-detection window (in minutes). Submitting the same member + amount + payment method + reference within this window triggers a "possible duplicate" warning requiring explicit confirmation.', 'number', false, 2, 'Set to 0 to disable duplicate detection.'),
  ('transactions.auto_resolve_ledger', 'true', 'transactions', 'Automatically select and show the single valid ledger for a (category, sub-type) that maps to exactly one ledger.', 'boolean', false, 3, 'When ON, single-ledger sub-types render the ledger read-only and auto-selected.'),
  ('transactions.transaction_id_prefix', 'TXN', 'transactions', 'Prefix for the internal permanent transaction identifier (format: PREFIX-YYYY-#####).', 'string', false, 4, 'Audit-critical; do not change after transactions exist.')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  data_type = EXCLUDED.data_type,
  is_public = EXCLUDED.is_public,
  display_order = EXCLUDED.display_order,
  help_text = EXCLUDED.help_text;

-- Link the seeded rows to the 'transactions' category.
UPDATE settings s
SET config_category_id = cc.id
FROM configuration_categories cc
WHERE cc.code = 'transactions' AND s.category = 'transactions' AND s.config_category_id IS NULL;