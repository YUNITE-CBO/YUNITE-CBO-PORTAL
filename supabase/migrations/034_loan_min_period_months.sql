-- 034_loan_min_period_months.sql
--
-- Establishes the system MINIMUM loan repayment period as a first-class,
-- configurable setting (loan.min_period_months = 1), complementing the
-- existing maximum (loan.max_period_months = 12).
--
-- Business rule enforced by the loan service (src/lib/services/loan.service.ts):
--   loan.min_period_months (default 1) <= repayment_period_months <= loan.max_period_months (default 12)
--
-- A per-loan override WITHIN this range (e.g. a 3-month loan when the default
-- is 12) is a LEGITIMATE business choice and is NOT a defect. The AI
-- business-rules engine now only flags loans OUTSIDE the [min, max] range.

-- Seed the minimum-period setting under the 'loan' config category.
INSERT INTO settings (key, value, category)
VALUES ('loan.min_period_months', '1', 'loan')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category;

-- Enrich the row with full metadata if the optional columns from migration 007
-- exist on the live DB (idempotent — wrapped so a partially-applied 007 cannot
-- break this migration). data_type='number', display_order sits just before the
-- max period so the two appear adjacent in the settings UI.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'data_type'
  ) THEN
    UPDATE settings
    SET data_type = 'number',
        config_category_id = (SELECT id FROM configuration_categories WHERE code = 'loan'),
        help_text = 'Minimum loan repayment period in months (system floor = 1)',
        display_order = COALESCE(
          (SELECT display_order FROM settings WHERE key = 'loan.max_period_months'),
          2
        ) - 1
    WHERE key = 'loan.min_period_months';
  END IF;
END $$;

-- Clamp any existing loans whose repayment_period_months is below the minimum
-- (impossible values from legacy data paths). These are repaired to the min so
-- monthly_repayment stays mathematically valid. balances are unaffected
-- (balance_after is stored per-row).
UPDATE loans
SET repayment_period_months = 1
WHERE repayment_period_months < 1;

-- Re-clamp any loans still above the maximum (defensive; migration 032 already
-- did this, but loans created between then and the validation hardening are
-- covered here too).
UPDATE loans
SET repayment_period_months = (
  SELECT COALESCE(value::integer, 12) FROM settings WHERE key = 'loan.max_period_months'
)
WHERE repayment_period_months > (
  SELECT COALESCE(value::integer, 12) FROM settings WHERE key = 'loan.max_period_months'
);

-- Recompute monthly_repayment for any loan whose period was clamped above, so
-- the stored monthly_repayment matches total_amount / repayment_period_months
-- (the BR-001 invariant). Only touches rows that actually changed.
UPDATE loans
SET monthly_repayment = total_amount / repayment_period_months
WHERE monthly_repayment IS DISTINCT FROM (total_amount / repayment_period_months);
