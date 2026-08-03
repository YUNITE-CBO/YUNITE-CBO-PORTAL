-- YUNITE Enterprise Operating System
-- Migration 003: Schema Updates for Complete Feature Support
-- Fixes constraints to match application requirements

-- ============================================
-- UPDATE FINES TABLE: Add missing fine types
-- ============================================
ALTER TABLE fines DROP CONSTRAINT IF EXISTS fines_fine_type_check;
ALTER TABLE fines ADD CONSTRAINT fines_fine_type_check 
    CHECK (fine_type IN (
        'late_payment', 
        'missing_meeting', 
        'non_compliance', 
        'documentation', 
        'misconduct', 
        'share_shortfall', 
        'loan_default', 
        'other',
        'penalty', 
        'manual'
    ));

-- ============================================
-- UPDATE LOANS TABLE: Add rejected status
-- ============================================
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check 
    CHECK (status IN (
        'pending', 
        'approved', 
        'disbursed', 
        'active', 
        'completed', 
        'defaulted',
        'rejected'
    ));

-- ============================================
-- ADD MISSING COLUMNS TO LOANS TABLE
-- ============================================
ALTER TABLE loans ADD COLUMN IF NOT EXISTS application_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS approved_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS rejected_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS rejected_by UUID;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ============================================
-- ADD MISSING COLUMNS TO FINES TABLE
-- ============================================
ALTER TABLE fines ADD COLUMN IF NOT EXISTS waived_date TIMESTAMPTZ;
ALTER TABLE fines ADD COLUMN IF NOT EXISTS waived_by UUID;
ALTER TABLE fines ADD COLUMN IF NOT EXISTS waiver_reason TEXT;

-- ============================================
-- ADD MISSING COLUMNS TO TRANSACTIONS TABLE
-- ============================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- ADD INDEXES FOR COMMON QUERIES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_loans_loan_number ON loans(loan_number);
CREATE INDEX IF NOT EXISTS idx_loans_application_date ON loans(application_date);
CREATE INDEX IF NOT EXISTS idx_loans_disbursement_date ON loans(disbursement_date);
CREATE INDEX IF NOT EXISTS idx_fines_fine_number ON fines(fine_number);
CREATE INDEX IF NOT EXISTS idx_fines_due_date ON fines(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_number);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ============================================
-- UPDATE CAMPAIGNS TABLE: Add created_by
-- ============================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'general';

-- ============================================
-- SEED DATA: Ensure required settings exist
-- ============================================
INSERT INTO settings (key, value, category, description) VALUES
    ('loan.min_percentage', '0', 'loan', 'Minimum loan percentage of savings'),
    ('loan.processing_fee', '1', 'loan', 'Loan processing fee percentage'),
    ('fines.default_amount', '500', 'fines', 'Default fine amount'),
    ('organization.registration_number', '', 'organization', 'Organization registration number')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE loans IS 'Loan applications and disbursements - balance tracked via transactions table';
COMMENT ON TABLE fines IS 'Member fines and penalties - balance tracked via transactions table';
COMMENT ON TABLE campaigns IS 'Contribution campaigns for tracking fundraising goals';
COMMENT ON COLUMN loans.status IS 'pending|approved|disbursed|active|completed|defaulted|rejected';
COMMENT ON COLUMN fines.status IS 'pending|partial|paid|waived';
COMMENT ON COLUMN fines.fine_type IS 'late_payment|missing_meeting|non_compliance|documentation|misconduct|share_shortfall|loan_default|other|penalty|manual';
