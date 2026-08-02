-- YUNITE Enterprise Operating System
-- Database Schema - Release 1
-- 
-- Core Principle: Single Source of Truth
-- Every balance is calculated from transaction ledger.

-- ============================================
-- ORGANIZATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    registration_number TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    currency TEXT DEFAULT 'KES',
    country TEXT DEFAULT 'KE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEMBERS (Single Source of Truth)
-- ============================================
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_number TEXT UNIQUE NOT NULL,
    
    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    id_number TEXT,
    
    -- Demographics
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    
    -- Addresses
    physical_address TEXT,
    postal_address TEXT,
    
    -- Employment
    occupation TEXT,
    employer TEXT,
    employer_address TEXT,
    
    -- Next of Kin
    next_of_kin_name TEXT,
    next_of_kin_phone TEXT,
    next_of_kin_relationship TEXT,
    
    -- Membership
    registration_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'withdrawn', 'deceased')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(member_number);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at);

-- ============================================
-- ACCOUNTS (Logical Workspaces per Member)
-- Account Type: savings, shares, contributions, welfare, fines, loans
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN ('savings', 'shares', 'contributions', 'welfare', 'fines', 'loans')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'frozen')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(member_id, account_type)
);

CREATE INDEX IF NOT EXISTS idx_accounts_member_id ON accounts(member_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);

-- ============================================
-- TRANSACTIONS (AUTHORITATIVE LEDGER)
-- Single Source of Truth for all balances
-- NEVER delete transactions - use reversals
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_ref TEXT UNIQUE NOT NULL,
    
    -- References
    member_id UUID NOT NULL REFERENCES members(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    
    -- Transaction Details
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'savings_deposit', 'savings_withdrawal', 'savings_adjustment',
        'registration_fee', 'annual_fee',
        'contribution_monthly', 'contribution_special', 'contribution_development',
        'welfare_deposit', 'welfare_disbursement',
        'fine_posting', 'fine_payment',
        'loan_disbursement', 'loan_repayment',
        'reversal'
    )),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    
    -- Balance Snapshots (for statement generation)
    balance_before DECIMAL(15, 2) NOT NULL DEFAULT 0,
    balance_after DECIMAL(15, 2) NOT NULL DEFAULT 0,
    
    -- Reference and Description
    description TEXT,
    reference_number TEXT,
    
    -- Audit
    posted_by UUID,
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Reversal Support
    reversed BOOLEAN DEFAULT FALSE,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID,
    reversal_reason TEXT,
    
    -- Metadata (JSONB for extensibility)
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_posted_at ON transactions(posted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_reversed ON transactions(reversed);

-- ============================================
-- LOANS
-- ============================================
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_number TEXT UNIQUE NOT NULL,
    member_id UUID NOT NULL REFERENCES members(id),
    
    -- Loan Details
    loan_type TEXT NOT NULL,
    principal_amount DECIMAL(15, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    interest_amount DECIMAL(15, 2) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    amount_due DECIMAL(15, 2) NOT NULL,
    
    -- Repayment Schedule
    repayment_period_months INTEGER NOT NULL,
    monthly_repayment DECIMAL(15, 2) NOT NULL,
    disbursement_date DATE,
    repayment_start_date DATE,
    repayment_end_date DATE,
    disbursed_by UUID,
    
    -- Purpose
    purpose TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disbursed', 'active', 'completed', 'defaulted')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

-- ============================================
-- FINES
-- ============================================
CREATE TABLE IF NOT EXISTS fines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fine_number TEXT UNIQUE NOT NULL,
    member_id UUID NOT NULL REFERENCES members(id),
    
    -- Fine Details
    fine_type TEXT NOT NULL CHECK (fine_type IN ('meeting_absence', 'late_payment', 'penalty', 'manual')),
    amount DECIMAL(15, 2) NOT NULL,
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    reason TEXT NOT NULL,
    due_date DATE,
    
    -- Audit
    issued_by UUID,
    issued_date TIMESTAMPTZ DEFAULT NOW(),
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'waived')),
    paid_date TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fines_member_id ON fines(member_id);
CREATE INDEX IF NOT EXISTS idx_fines_status ON fines(status);

-- ============================================
-- DOCUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    
    -- Document Details
    document_type TEXT NOT NULL CHECK (document_type IN ('national_id', 'passport', 'photo', 'kra_pin', 'membership_form', 'contract', 'certificate', 'other')),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    expiry_date DATE,
    
    -- Verification
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    uploaded_by UUID,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_member_id ON documents(member_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

-- ============================================
-- COMPLIANCE RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    
    compliance_type TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'missing', 'expired')),
    due_date DATE,
    completed_date DATE,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_member_id ON compliance_records(member_id);

-- ============================================
-- SETTINGS (Business Rules)
-- All business rules come from here - never hardcode
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- ============================================
-- AUDIT LOGS (Immutable)
-- Every important action is logged
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who and What
    user_id UUID,
    action TEXT NOT NULL,
    record_id TEXT NOT NULL,
    
    -- Change Tracking
    before_value JSONB,
    after_value JSONB,
    
    -- Context
    description TEXT,
    ip_address TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- ============================================
-- USERS (Admin Users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'staff' CHECK (role IN ('super_admin', 'admin', 'staff', 'viewer')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public read access for authenticated users (simplified for demo)
CREATE POLICY "Public read access" ON members FOR SELECT USING (true);
CREATE POLICY "Public read access" ON accounts FOR SELECT USING (true);
CREATE POLICY "Public read access" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON loans FOR SELECT USING (true);
CREATE POLICY "Public read access" ON fines FOR SELECT USING (true);
CREATE POLICY "Public read access" ON documents FOR SELECT USING (true);
CREATE POLICY "Public read access" ON compliance_records FOR SELECT USING (true);
CREATE POLICY "Public read access" ON settings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON users FOR SELECT USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access" ON members FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON loans FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON fines FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON documents FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON compliance_records FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON users FOR ALL USING (auth.role() = 'service_role');

-- Audit logs are append-only
CREATE POLICY "Audit insert only" ON audit_logs FOR INSERT WITH CHECK (true);

-- ============================================
-- DEFAULT SETTINGS (Seed Data)
-- ============================================
INSERT INTO settings (key, value, category) VALUES
    -- Shares
    ('shares.share_value', '100', 'financial'),
    
    -- Loan
    ('loan.max_percentage', '75', 'loan'),
    ('loan.max_period_months', '12', 'loan'),
    ('loan.default_interest_rate', '10', 'loan'),
    ('loan.max_amount', '500000', 'loan'),
    
    -- Fees
    ('fees.registration', '500', 'fees'),
    ('fees.annual', '2000', 'fees'),
    
    -- Organization
    ('organization.name', 'YUNITE CBO', 'organization'),
    ('organization.currency', 'KES', 'organization'),
    ('organization.country', 'KE', 'organization'),
    
    -- Welfare
    ('welfare.monthly_amount', '500', 'welfare'),
    
    -- Contributions
    ('contributions.monthly_default', '1000', 'contributions')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fines_updated_at BEFORE UPDATE ON fines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
