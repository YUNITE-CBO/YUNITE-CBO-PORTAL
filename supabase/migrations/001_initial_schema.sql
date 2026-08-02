-- ===========================================
-- YUNITE Enterprise Operating System
-- Database Schema - Release 1
-- ===========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- ORGANIZATIONS
-- ===========================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- USERS (System Users / Staff)
-- ===========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ===========================================
-- MEMBERS
-- ===========================================
CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    id_number VARCHAR(50),
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    physical_address TEXT,
    postal_address TEXT,
    occupation VARCHAR(100),
    employer VARCHAR(255),
    employer_address TEXT,
    next_of_kin_name VARCHAR(255),
    next_of_kin_phone VARCHAR(50),
    next_of_kin_relationship VARCHAR(50),
    registration_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'withdrawn', 'deceased')),
    profile_photo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_members_member_number ON members(member_number);
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_name ON members(last_name, first_name);

-- ===========================================
-- ACCOUNTS
-- ===========================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('savings', 'shares', 'contributions', 'welfare', 'fines', 'loans')),
    account_number VARCHAR(50) UNIQUE NOT NULL,
    balance DECIMAL(18, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_member_id ON accounts(member_id);
CREATE INDEX idx_accounts_type ON accounts(account_type);
CREATE INDEX idx_accounts_member_type ON accounts(member_id, account_type);

-- ===========================================
-- TRANSACTIONS
-- ===========================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_ref VARCHAR(50) UNIQUE NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    member_id UUID NOT NULL REFERENCES members(id),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 'transfer', 'fee', 'fine',
        'loan_disbursement', 'loan_repayment', 'contribution',
        'share_purchase', 'interest', 'adjustment', 'reversal'
    )),
    amount DECIMAL(18, 2) NOT NULL,
    balance_before DECIMAL(18, 2) NOT NULL,
    balance_after DECIMAL(18, 2) NOT NULL,
    description TEXT,
    reference_number VARCHAR(100),
    posted_by UUID NOT NULL REFERENCES users(id),
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    reversed BOOLEAN DEFAULT false,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES users(id),
    reversal_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_member_id ON transactions(member_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_posted_at ON transactions(posted_at);
CREATE INDEX idx_transactions_reference ON transactions(transaction_ref);

-- ===========================================
-- LOANS
-- ===========================================
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_number VARCHAR(50) UNIQUE NOT NULL,
    member_id UUID NOT NULL REFERENCES members(id),
    principal_amount DECIMAL(18, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    interest_amount DECIMAL(18, 2) NOT NULL,
    total_amount DECIMAL(18, 2) NOT NULL,
    amount_paid DECIMAL(18, 2) DEFAULT 0.00,
    amount_due DECIMAL(18, 2) NOT NULL,
    loan_type VARCHAR(50) NOT NULL,
    purpose TEXT,
    application_date DATE DEFAULT CURRENT_DATE,
    approval_date DATE,
    disbursement_date DATE,
    repayment_start_date DATE,
    repayment_end_date DATE,
    repayment_period_months INTEGER,
    monthly_repayment DECIMAL(18, 2),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'disbursed', 'active', 
        'completed', 'defaulted', 'written_off', 'rejected'
    )),
    approved_by UUID REFERENCES users(id),
    disbursed_by UUID REFERENCES users(id),
    collateral_description TEXT,
    guarantor_id UUID REFERENCES members(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loans_member_id ON loans(member_id);
CREATE INDEX idx_loans_number ON loans(loan_number);
CREATE INDEX idx_loans_status ON loans(status);

-- ===========================================
-- FINES
-- ===========================================
CREATE TABLE fines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fine_number VARCHAR(50) UNIQUE NOT NULL,
    member_id UUID NOT NULL REFERENCES members(id),
    fine_type VARCHAR(100) NOT NULL,
    amount DECIMAL(18, 2) NOT NULL,
    amount_paid DECIMAL(18, 2) DEFAULT 0.00,
    reason TEXT NOT NULL,
    issued_by UUID NOT NULL REFERENCES users(id),
    issued_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'waived', 'written_off')),
    waived_by UUID REFERENCES users(id),
    waived_at TIMESTAMPTZ,
    waiver_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fines_member_id ON fines(member_id);
CREATE INDEX idx_fines_status ON fines(status);

-- ===========================================
-- CONTRIBUTION CAMPAIGNS
-- ===========================================
CREATE TABLE contribution_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_name VARCHAR(255) NOT NULL,
    description TEXT,
    target_amount DECIMAL(18, 2),
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- CONTRIBUTION PAYMENTS
-- ===========================================
CREATE TABLE contribution_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id),
    campaign_id UUID NOT NULL REFERENCES contribution_campaigns(id),
    amount DECIMAL(18, 2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50),
    reference VARCHAR(100),
    posted_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contributions_member ON contribution_payments(member_id);
CREATE INDEX idx_contributions_campaign ON contribution_payments(campaign_id);

-- ===========================================
-- DOCUMENTS
-- ===========================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id),
    document_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_member_id ON documents(member_id);
CREATE INDEX idx_documents_type ON documents(document_type);

-- ===========================================
-- COMPLIANCE RECORDS
-- ===========================================
CREATE TABLE compliance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id),
    compliance_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('compliant', 'pending', 'non_compliant')),
    due_date DATE,
    completed_date DATE,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_member_id ON compliance_records(member_id);

-- ===========================================
-- AUDIT LOGS
-- ===========================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- ===========================================
-- SETTINGS
-- ===========================================
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(20) NOT NULL CHECK (category IN ('organization', 'financial', 'membership', 'loan', 'system')),
    is_encrypted BOOLEAN DEFAULT false,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_key ON settings(key);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to generate member number
CREATE OR REPLACE FUNCTION generate_member_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.member_number IS NULL OR NEW.member_number = '' THEN
        NEW.member_number := 'MBR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(CAST(COALESCE((SELECT COUNT(*) + 1 FROM members), 1) AS TEXT), 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate account number
CREATE OR REPLACE FUNCTION generate_account_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.account_number IS NULL OR NEW.account_number = '' THEN
        NEW.account_number := 'ACC-' || UPPER(LEFT(NEW.account_type, 3)) || '-' || SUBSTRING(NEW.member_id::TEXT, 1, 8) || '-' || LPAD(CAST(COALESCE((SELECT COUNT(*) + 1 FROM accounts WHERE member_id = NEW.member_id), 1) AS TEXT), 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate transaction reference
CREATE OR REPLACE FUNCTION generate_transaction_ref()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_ref IS NULL OR NEW.transaction_ref = '' THEN
        NEW.transaction_ref := 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.transaction_type, 1, 3)) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate loan number
CREATE OR REPLACE FUNCTION generate_loan_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.loan_number IS NULL OR NEW.loan_number = '' THEN
        NEW.loan_number := 'LN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(CAST(COALESCE((SELECT COUNT(*) + 1 FROM loans), 1) AS TEXT), 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate fine number
CREATE OR REPLACE FUNCTION generate_fine_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fine_number IS NULL OR NEW.fine_number = '' THEN
        NEW.fine_number := 'FN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(CAST(COALESCE((SELECT COUNT(*) + 1 FROM fines), 1) AS TEXT), 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Members triggers
CREATE TRIGGER trigger_generate_member_number
    BEFORE INSERT ON members
    FOR EACH ROW
    EXECUTE FUNCTION generate_member_number();

CREATE TRIGGER trigger_members_updated_at
    BEFORE UPDATE ON members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Accounts triggers
CREATE TRIGGER trigger_generate_account_number
    BEFORE INSERT ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION generate_account_number();

CREATE TRIGGER trigger_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Transactions triggers
CREATE TRIGGER trigger_generate_transaction_ref
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION generate_transaction_ref();

-- Loans triggers
CREATE TRIGGER trigger_generate_loan_number
    BEFORE INSERT ON loans
    FOR EACH ROW
    EXECUTE FUNCTION generate_loan_number();

CREATE TRIGGER trigger_loans_updated_at
    BEFORE UPDATE ON loans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Fines triggers
CREATE TRIGGER trigger_generate_fine_number
    BEFORE INSERT ON fines
    FOR EACH ROW
    EXECUTE FUNCTION generate_fine_number();

CREATE TRIGGER trigger_fines_updated_at
    BEFORE UPDATE ON fines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Settings trigger
CREATE TRIGGER trigger_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Enable service role bypass on all tables
CREATE POLICY "Service role full access" ON ALL TABLES
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Admin and staff can read all
CREATE POLICY "Admin and staff read access" ON ALL TABLES
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin', 'staff')
            AND users.is_active = true
        )
    );

-- Admin can insert/update/delete
CREATE POLICY "Admin write access" ON ALL TABLES
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin', 'staff')
            AND users.is_active = true
        )
    );

CREATE POLICY "Admin update access" ON ALL TABLES
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin', 'staff')
            AND users.is_active = true
        )
    );

-- ===========================================
-- DEFAULT SETTINGS
-- ===========================================

INSERT INTO settings (key, value, description, category) VALUES
    ('organization.name', 'YUNITE CBO', 'Organization Name', 'organization'),
    ('organization.email', 'info@yunite.ke', 'Organization Email', 'organization'),
    ('organization.phone', '+254700000000', 'Organization Phone', 'organization'),
    ('savings.minimum_balance', '0', 'Minimum savings balance', 'financial'),
    ('shares.conversion_rate', '1.0', 'Savings to shares conversion rate', 'financial'),
    ('membership.registration_fee', '1000', 'Membership registration fee', 'membership'),
    ('membership.annual_fee', '500', 'Annual membership fee', 'membership'),
    ('membership.fee_frequency', 'yearly', 'Annual fee frequency', 'membership'),
    ('loan.max_eligibility_percentage', '200', 'Maximum loan eligibility as % of savings', 'loan'),
    ('loan.max_loan_period_months', '12', 'Maximum loan repayment period', 'loan'),
    ('loan.default_interest_rate', '10', 'Default interest rate %', 'loan'),
    ('system.currency', 'KES', 'System currency', 'system'),
    ('system.currency_symbol', 'KSh', 'Currency symbol', 'system');

-- ===========================================
-- DEFAULT ADMIN USER
-- ===========================================

INSERT INTO users (email, password_hash, full_name, role) VALUES
    ('admin@yunite.ke', '$2a$10$YourHashedPasswordHere', 'System Administrator', 'super_admin');
