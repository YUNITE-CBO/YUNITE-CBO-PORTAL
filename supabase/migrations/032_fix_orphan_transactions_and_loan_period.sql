-- 032_fix_orphan_transactions_and_loan_period.sql
--
-- Fixes three findings from the AI forensic investigation:
--
-- DB-002: 7 transactions in the live DB have member_id = NULL despite the
--   schema declaring NOT NULL. These orphaned ledger entries break per-member
--   balance derivation and cause the member statement endpoint to 500. The
--   business rule "NEVER delete transactions" means we mark them reversed
--   with an audit reason rather than deleting, then re-enforce NOT NULL.
--
-- API-001: loans.apply had minRole 'viewer' in the manifest — fixed in code.
--   No migration needed (the manifest is the source of truth, and the
--   api_consistency engine reads it at runtime).
--
-- BR-003: loan.max_period_months was used as the DEFAULT repayment period,
--   but it is the MAXIMUM. A new setting loan.default_period_months (default
--   12) separates the two concepts; the loan service now validates
--   1 <= period <= max. This migration seeds the new setting and backfills
--   any existing loans that exceed the max (capping them at the max).

-- ============================================
-- DB-002: FIX ORPHAN TRANSACTIONS
-- ============================================

-- Mark orphan transactions as reversed (preserves audit trail; never deletes).
-- This makes them invisible to balance calculations (the engine filters
-- reversed = false) while keeping the rows for forensic review.
UPDATE transactions
SET reversed = true,
    reversed_at = now(),
    reversal_reason = 'Orphaned ledger entry: member_id was NULL. Reversed by migration 032 to restore ledger integrity.',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"orphan_repaired": true, "orphan_repair_migration": "032"}'::jsonb
WHERE member_id IS NULL;

-- Re-enforce the NOT NULL constraint (the schema has it, but the live DB may
-- have been created without it or had it dropped at some point).
ALTER TABLE transactions ALTER COLUMN member_id SET NOT NULL;

-- Add a defensive trigger: reject any future insert with a NULL member_id.
-- This is belt-and-suspenders since the transaction engine already validates,
-- but it catches direct DB insertsions / future code paths.
CREATE OR REPLACE FUNCTION prevent_null_member_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.member_id IS NULL THEN
    RAISE EXCEPTION 'transactions.member_id cannot be NULL — rejected by prevent_null_member_id trigger';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_null_member_id ON transactions;
CREATE TRIGGER trg_prevent_null_member_id
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION prevent_null_member_id();

-- ============================================
-- BR-003: SEED loan.default_period_months + BACKFILL OVER-MAX LOANS
-- ============================================

-- Seed the new default-period setting (separate from the max).
INSERT INTO settings (key, value, category)
VALUES ('loan.default_period_months', '12', 'loan')
ON CONFLICT (key) DO NOTHING;

-- Backfill any existing loans whose repayment_period_months exceeds the
-- configured max. These were created due to the old bug where max was used
-- as default and no validation occurred. We cap them at the max.
UPDATE loans
SET repayment_period_months = (
  SELECT COALESCE(
    (value::integer),
    12
  ) FROM settings WHERE key = 'loan.max_period_months'
)
WHERE repayment_period_months > (
  SELECT COALESCE(
    (value::integer),
    12
  ) FROM settings WHERE key = 'loan.max_period_months'
);

-- Also fix loans with period < 1 (impossible values from the same bug).
UPDATE loans
SET repayment_period_months = 12
WHERE repayment_period_months < 1;
