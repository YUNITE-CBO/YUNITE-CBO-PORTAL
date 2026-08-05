-- ===================================================================
-- PHASE 4: ENTERPRISE DOCUMENT, MEDIA & COMPLIANCE MANAGEMENT SYSTEM
-- & CONFIGURATION MANAGEMENT FRAMEWORK
-- YUNITE Enterprise Operating System - Release 1.2.0
-- ===================================================================

-- ===================================================================
-- PART 1: ENHANCED DOCUMENTS TABLE
-- Extended from original documents table with versioning and metadata
-- ===================================================================

-- Add missing columns to existing documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_file_name TEXT;

-- Add indexes for enhanced queries
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_member_id ON documents(member_id);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_type ON documents(document_type);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_status ON documents(status);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_storage_bucket ON documents(storage_bucket);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_archived ON documents(is_archived);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_version ON documents(version);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_documents_parent ON documents(parent_document_id);

-- ===================================================================
-- PART 2: DOCUMENT CATEGORIES TABLE
-- Configurable document categories for compliance requirements
-- ===================================================================

CREATE TABLE IF NOT EXISTS document_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    module TEXT NOT NULL, -- 'members', 'loans', 'meetings', 'accounting', etc.
    is_required BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    allowed_mime_types TEXT[] DEFAULT ARRAY['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.*']::TEXT[],
    max_file_size_mb INTEGER DEFAULT 10,
    retention_days INTEGER, -- NULL = forever
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default document categories for member compliance
INSERT INTO document_categories (code, name, description, module, is_required, sort_order) VALUES
    -- Member Documents
    ('member_national_id', 'National Identification', 'National ID card or equivalent', 'members', TRUE, 1),
    ('member_passport_photo', 'Passport Photograph', 'Recent passport-size photograph', 'members', TRUE, 2),
    ('member_kra_pin', 'KRA PIN Certificate', 'Kenya Revenue Authority PIN certificate', 'members', TRUE, 3),
    ('member_proof_residence', 'Proof of Residence', 'Utility bill or official document showing address', 'members', TRUE, 4),
    ('member_application_form', 'Membership Application Form', 'Signed membership application form', 'members', TRUE, 5),
    ('member_agreement', 'Member Agreement', 'Signed member agreement/contract', 'members', TRUE, 6),
    ('member_consent_form', 'Consent Form', 'Data protection and consent form', 'members', FALSE, 7),
    ('member_passport', 'Passport', 'Valid passport (if applicable)', 'members', FALSE, 8),
    ('member_certificate', 'Certificate/Qualification', 'Educational or professional certificates', 'members', FALSE, 9),
    ('member_tax_document', 'Tax Document', 'Tax compliance documents', 'members', FALSE, 10),
    ('member_employment', 'Employment Record', 'Employment letter or payslips', 'members', FALSE, 11),
    ('member_recommendation', 'Recommendation Letter', 'Professional or personal recommendation', 'members', FALSE, 12),
    
    -- Loan Documents
    ('loan_application', 'Loan Application Form', 'Completed loan application', 'loans', TRUE, 1),
    ('loan_agreement', 'Loan Agreement', 'Signed loan agreement contract', 'loans', TRUE, 2),
    ('loan_guarantor', 'Guarantor Documents', 'Guarantor identification and agreement', 'loans', TRUE, 3),
    ('loan_collateral', 'Collateral Documentation', 'Collateral ownership documents', 'loans', FALSE, 4),
    ('loan_repayment_schedule', 'Repayment Schedule', 'Signed repayment schedule', 'loans', TRUE, 5),
    
    -- Accounting Documents
    ('accounting_receipt', 'Receipt', 'Payment or purchase receipt', 'accounting', FALSE, 1),
    ('accounting_invoice', 'Invoice', 'Invoice or bill', 'accounting', FALSE, 2),
    ('accounting_voucher', 'Payment Voucher', 'Approved payment voucher', 'accounting', TRUE, 3),
    ('accounting_statement', 'Bank Statement', 'Bank statement for reconciliation', 'accounting', FALSE, 4),
    ('accounting_reconciliation', 'Reconciliation Report', 'Completed reconciliation document', 'accounting', FALSE, 5),
    
    -- Meeting Documents
    ('meeting_agenda', 'Meeting Agenda', 'Planned meeting agenda', 'meetings', TRUE, 1),
    ('meeting_attendance', 'Attendance Sheet', 'Signed attendance sheet', 'meetings', TRUE, 2),
    ('meeting_minutes', 'Meeting Minutes', 'Official meeting minutes', 'meetings', TRUE, 3),
    ('meeting_resolutions', 'Resolutions', 'Meeting resolutions document', 'meetings', TRUE, 4),
    
    -- Welfare Documents
    ('welfare_application', 'Welfare Application', 'Welfare assistance application', 'welfare', TRUE, 1),
    ('welfare_supporting', 'Supporting Evidence', 'Medical, death certificates, etc.', 'welfare', TRUE, 2),
    
    -- Project Documents
    ('project_proposal', 'Project Proposal', 'Project proposal document', 'projects', TRUE, 1),
    ('project_contract', 'Project Contract', 'Signed project contract', 'projects', TRUE, 2),
    ('project_progress', 'Progress Report', 'Project progress reports', 'projects', FALSE, 3),
    ('project_completion', 'Completion Report', 'Project completion report', 'projects', TRUE, 4)
ON CONFLICT (code) DO NOTHING;

-- ===================================================================
-- PART 3: CONFIGURATION CATEGORIES TABLE
-- Organized configuration sections for settings management
-- ===================================================================

CREATE TABLE IF NOT EXISTS configuration_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT DEFAULT '#3B82F6',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    parent_id UUID REFERENCES configuration_categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default configuration categories
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) VALUES
    ('organization', 'Organization', 'Organization profile and branding', 'building', '#10B981', 1),
    ('financial', 'Financial', 'Financial settings and rules', 'coins', '#3B82F6', 2),
    ('loan', 'Loans', 'Loan products and terms', 'banknotes', '#F59E0B', 3),
    ('savings', 'Savings', 'Savings account settings', 'piggy-bank', '#EC4899', 4),
    ('welfare', 'Welfare', 'Welfare scheme settings', 'heart', '#8B5CF6', 5),
    ('contributions', 'Contributions', 'Contribution campaigns', 'gift', '#06B6D4', 6),
    ('notifications', 'Notifications', 'Notification channels and templates', 'bell', '#EF4444', 7),
    ('smtp', 'Email (SMTP)', 'Email server configuration', 'mail', '#64748B', 8),
    ('security', 'Security', 'Security and access settings', 'shield', '#DC2626', 9),
    ('integrations', 'Integrations', 'Third-party integrations', 'plug', '#7C3AED', 10),
    ('compliance', 'Compliance', 'Compliance and document requirements', 'clipboard-check', '#059669', 11),
    ('branding', 'Branding', 'Logo, colors, and branding', 'palette', '#DB2777', 12),
    ('workflow', 'Workflow', 'Approval workflows and automation', 'git-branch', '#0891B2', 13),
    ('api', 'API Keys', 'API access and keys', 'key', '#4F46E5', 14)
ON CONFLICT (code) DO NOTHING;

-- ===================================================================
-- PART 4: CONFIGURATION SETTINGS TABLE (Enhanced)
-- Extended settings with metadata, validation, and change history
-- ===================================================================

-- Add new columns to existing settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS config_category_id UUID REFERENCES configuration_categories(id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json', 'password'));
ALTER TABLE settings ADD COLUMN IF NOT EXISTS validation_pattern TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_value NUMERIC;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_value NUMERIC;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS options JSONB; -- For enum-like settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE; -- Can be exposed to frontend
ALTER TABLE settings ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS help_text TEXT;

-- Create settings groups for better organization
CREATE TABLE IF NOT EXISTS settings_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES configuration_categories(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, code)
);

-- Seed default settings groups
INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'profile', 
    'Organization Profile', 
    'Basic organization information',
    1
FROM configuration_categories cc WHERE cc.code = 'organization'
ON CONFLICT DO NOTHING;

INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'branding', 
    'Branding', 
    'Logo and visual identity',
    2
FROM configuration_categories cc WHERE cc.code = 'organization'
ON CONFLICT DO NOTHING;

INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'shares', 
    'Shares', 
    'Share value and minimum holdings',
    1
FROM configuration_categories cc WHERE cc.code = 'financial'
ON CONFLICT DO NOTHING;

INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'fees', 
    'Fees', 
    'Registration and other fees',
    2
FROM configuration_categories cc WHERE cc.code = 'financial'
ON CONFLICT DO NOTHING;

INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'terms', 
    'Loan Terms', 
    'Interest rates and loan limits',
    1
FROM configuration_categories cc WHERE cc.code = 'loan'
ON CONFLICT DO NOTHING;

INSERT INTO settings_groups (category_id, code, name, description, sort_order)
SELECT 
    cc.id, 
    'guarantors', 
    'Guarantors', 
    'Guarantor requirements',
    2
FROM configuration_categories cc WHERE cc.code = 'loan'
ON CONFLICT DO NOTHING;

-- ===================================================================
-- PART 5: CONFIGURATION CHANGE HISTORY TABLE
-- Track all configuration changes for audit
-- ===================================================================

CREATE TABLE IF NOT EXISTS configuration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    old_value_masked TEXT, -- For passwords/secrets
    new_value_masked TEXT,
    changed_by UUID REFERENCES users(id),
    changed_by_name TEXT,
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_; CREATE INDEX idx_config_history_key ON configuration_history(setting_key);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_config_history_by ON configuration_history(changed_by);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_config_history_created ON configuration_history(created_at DESC);

-- ===================================================================
-- PART 6: MEMBER COMPLIANCE TRACKING TABLE
-- Track member compliance status across all requirements
-- ===================================================================

CREATE TABLE IF NOT EXISTS member_compliance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    document_category_id UUID REFERENCES document_categories(id),
    document_category_code TEXT NOT NULL,
    document_id UUID REFERENCES documents(id), -- Latest verified document
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'not_required')),
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    expiry_date DATE,
    next_review_date DATE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_count INTEGER DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_; CREATE INDEX idx_member_compliance_member ON member_compliance(member_id);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_member_compliance_status ON member_compliance(status);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_member_compliance_category ON member_compliance(document_category_code);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_member_compliance_expiry ON member_compliance(expiry_date) WHERE expiry_date IS NOT NULL;

-- ===================================================================
-- PART 7: MEMBER APPROVAL WORKFLOW TABLE
-- Formal approval workflow for member registration
-- ===================================================================

CREATE TABLE IF NOT EXISTS member_approval_workflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    current_stage TEXT DEFAULT 'documentation' CHECK (current_stage IN ('documentation', 'review', 'approval', 'completed', 'rejected')),
    required_documents_complete BOOLEAN DEFAULT FALSE,
    compliance_score INTEGER DEFAULT 0, -- 0-100
    notes TEXT,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_; CREATE INDEX idx_approval_workflow_member ON member_approval_workflow(member_id);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_approval_workflow_stage ON member_approval_workflow(current_stage);

-- ===================================================================
-- PART 8: FILE UPLOADS TABLE
-- Track all file uploads with metadata
-- ===================================================================

CREATE TABLE IF NOT EXISTS file_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    storage_bucket TEXT DEFAULT 'documents',
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    checksum TEXT,
    module TEXT NOT NULL, -- 'members', 'loans', 'meetings', etc.
    entity_type TEXT NOT NULL, -- 'member', 'loan', 'meeting', etc.
    entity_id UUID NOT NULL,
    document_category_id UUID REFERENCES document_categories(id),
    uploaded_by UUID REFERENCES users(id),
    uploaded_by_name TEXT,
    ip_address INET,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES users(id),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id),
    deletion_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_; CREATE INDEX idx_file_uploads_entity ON file_uploads(module, entity_type, entity_id);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_file_uploads_bucket ON file_uploads(storage_bucket);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_file_uploads_status ON file_uploads(status);
DROP INDEX IF EXISTS idx_; CREATE INDEX idx_file_uploads_created ON file_uploads(created_at DESC);

-- ===================================================================
-- PART 9: NOTIFICATION TEMPLATES (Extended for Config Changes)
-- Add templates for configuration change notifications
-- ===================================================================

-- Check if notification_templates table exists and add template if not exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_templates') THEN
        -- Insert configuration change notification template
        INSERT INTO notification_templates (
            template_code, 
            name, 
            description, 
            subject_template, 
            body_template,
            channels,
            priority,
            is_active
        ) VALUES (
            'config_change_admin',
            'Configuration Change Alert',
            'Notifies admins when critical settings are changed',
            '[YUNITE] Configuration Changed: {{setting_name}}',
            'Dear Admin,

The following system configuration was changed:

Setting: {{setting_name}}
Changed by: {{changed_by}}
Changed at: {{changed_at}}

Previous Value: {{old_value}}
New Value: {{new_value}}

Reason: {{reason}}

This is an automated notification from YUNITE Enterprise OS.

Best regards,
YUNITE System',
            ARRAY['in_app']::TEXT[],
            'high',
            true
        )
        ON CONFLICT (template_code) DO NOTHING;
    END IF;
END $$;

-- ===================================================================
-- PART 10: SUPABASE STORAGE BUCKETS
-- Create storage buckets for different document types
-- Note: Run this separately if needed, Supabase CLI handles this
-- ===================================================================

-- Document buckets (these would typically be created via Supabase Dashboard)
-- The application will use these bucket names:
-- - 'documents' - General document storage
-- - 'member-documents' - Member-specific documents
-- - 'loan-documents' - Loan-related documents
-- - 'audit-evidence' - Audit and compliance documents

-- ===================================================================
-- PART 11: FUNCTIONS AND TRIGGERS
-- ===================================================================

-- Auto-update updated_at for new tables
CREATE OR REPLACE FUNCTION update_member_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_member_compliance_updated_at
    BEFORE UPDATE ON member_compliance
    FOR EACH ROW EXECUTE FUNCTION update_member_compliance_updated_at();

CREATE TRIGGER update_member_approval_workflow_updated_at
    BEFORE UPDATE ON member_approval_workflow
    FOR EACH ROW EXECUTE FUNCTION update_member_compliance_updated_at();

CREATE TRIGGER update_document_categories_updated_at
    BEFORE UPDATE ON document_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuration_categories_updated_at
    BEFORE UPDATE ON configuration_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to initialize member compliance when a member is created
CREATE OR REPLACE FUNCTION initialize_member_compliance()
RETURNS TRIGGER AS $$
DECLARE
    cat_record RECORD;
BEGIN
    -- For each required member document category, create a compliance record
    FOR cat_record IN SELECT id, code FROM document_categories WHERE module = 'members' AND is_required = TRUE LOOP
        INSERT INTO member_compliance (
            member_id, 
            document_category_id, 
            document_category_code, 
            status
        ) VALUES (
            NEW.id,
            cat_record.id,
            cat_record.code,
            'pending'
        );
    END LOOP;
    
    -- Create approval workflow record
    INSERT INTO member_approval_workflow (
        member_id,
        current_stage,
        compliance_score
    ) VALUES (
        NEW.id,
        'documentation',
        0
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to initialize compliance when new member is created
DROP TRIGGER IF EXISTS on_member_created_compliance ON members;
CREATE TRIGGER on_member_created_compliance
    AFTER INSERT ON members
    FOR EACH ROW EXECUTE FUNCTION initialize_member_compliance();

-- Function to update compliance score
CREATE OR REPLACE FUNCTION update_member_compliance_score()
RETURNS TRIGGER AS $$
DECLARE
    total_required INTEGER;
    total_approved INTEGER;
    new_score INTEGER;
BEGIN
    -- Count required documents for this member
    SELECT COUNT(*) INTO total_required
    FROM member_compliance
    WHERE member_id = NEW.member_id 
    AND status IN ('approved', 'not_required');
    
    -- Count approved/accepted documents
    SELECT COUNT(*) INTO total_approved
    FROM member_compliance
    WHERE member_id = NEW.member_id 
    AND status IN ('approved');
    
    -- Calculate score (required docs have weight 10 each)
    SELECT COALESCE((total_approved * 100) / NULLIF(total_required, 0), 0) INTO new_score;
    
    -- Update workflow score
    UPDATE member_approval_workflow
    SET compliance_score = new_score,
        required_documents_complete = (new_score = 100)
    WHERE member_id = NEW.member_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate score when compliance changes
DROP TRIGGER IF EXISTS on_compliance_change ON member_compliance;
CREATE TRIGGER on_compliance_change
    AFTER UPDATE OF status ON member_compliance
    FOR EACH ROW EXECUTE FUNCTION update_member_compliance_score();

-- ===================================================================
-- PART 12: SEED DEFAULT CONFIGURATION VALUES
-- Add extended settings with proper categorization
-- ===================================================================

-- Update existing settings with category references
UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'financial'),
    data_type = 'number',
    display_order = 1,
    help_text = 'Value of one share in currency units'
WHERE key = 'shares.share_value';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'loan'),
    data_type = 'number',
    display_order = 1,
    help_text = 'Maximum loan amount in currency units'
WHERE key = 'loan.max_amount';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'loan'),
    data_type = 'number',
    display_order = 2,
    help_text = 'Loan repayment period in months'
WHERE key = 'loan.max_period_months';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'loan'),
    data_type = 'number',
    display_order = 3,
    help_text = 'Annual interest rate percentage'
WHERE key = 'loan.default_interest_rate';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'financial'),
    data_type = 'number',
    display_order = 1,
    help_text = 'New member registration fee'
WHERE key = 'fees.registration';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'financial'),
    data_type = 'number',
    display_order = 2,
    help_text = 'Annual membership fee'
WHERE key = 'fees.annual';

UPDATE settings SET 
    config_category_id = (SELECT id FROM configuration_categories WHERE code = 'organization'),
    data_type = 'string',
    display_order = 1,
    help_text = 'Official organization name'
WHERE key = 'organization.name';

-- Insert additional configuration settings
INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.registration_number',
    '',
    'organization',
    id,
    'string',
    2,
    'Organization registration/certificate number'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.email',
    '',
    'organization',
    id,
    'string',
    3,
    'Primary contact email address'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.phone',
    '',
    'organization',
    id,
    'string',
    4,
    'Primary contact phone number'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.address',
    '',
    'organization',
    id,
    'string',
    5,
    'Physical address'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text, is_public)
SELECT 
    'organization.logo_url',
    '',
    'organization',
    id,
    'string',
    6,
    'URL to organization logo image',
    true
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.country',
    'KE',
    'organization',
    id,
    'string',
    7,
    'Country code (ISO 3166-1 alpha-2)'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'organization.currency',
    'KES',
    'organization',
    id,
    'string',
    8,
    'Default currency code (ISO 4217)'
FROM configuration_categories WHERE code = 'organization'
ON CONFLICT (key) DO NOTHING;

-- Security settings
INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'security.max_login_attempts',
    '5',
    'security',
    id,
    'number',
    1,
    'Maximum failed login attempts before lockout'
FROM configuration_categories WHERE code = 'security'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'security.lockout_minutes',
    '30',
    'security',
    id,
    'number',
    2,
    'Account lockout duration in minutes'
FROM configuration_categories WHERE code = 'security'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'security.session_hours',
    '24',
    'security',
    id,
    'number',
    3,
    'Session duration in hours'
FROM configuration_categories WHERE code = 'security'
ON CONFLICT (key) DO NOTHING;

-- SMTP settings
INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.host',
    '',
    'smtp',
    id,
    'string',
    1,
    'SMTP server hostname'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.port',
    '587',
    'smtp',
    id,
    'number',
    2,
    'SMTP server port (usually 587 for TLS)'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.username',
    '',
    'smtp',
    id,
    'string',
    3,
    'SMTP authentication username'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.password',
    '',
    'smtp',
    id,
    'password',
    4,
    'SMTP authentication password'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.from_email',
    '',
    'smtp',
    id,
    'string',
    5,
    'Email address to send from'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'smtp.from_name',
    'YUNITE System',
    'smtp',
    id,
    'string',
    6,
    'Name to send emails from'
FROM configuration_categories WHERE code = 'smtp'
ON CONFLICT (key) DO NOTHING;

-- Welfare settings
INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'welfare.monthly_amount',
    '500',
    'welfare',
    id,
    'number',
    1,
    'Monthly welfare contribution amount'
FROM configuration_categories WHERE code = 'welfare'
ON CONFLICT (key) DO NOTHING;

-- Contributions settings
INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
SELECT 
    'contributions.monthly_default',
    '1000',
    'contributions',
    id,
    'number',
    1,
    'Default monthly contribution amount'
FROM configuration_categories WHERE code = 'contributions'
ON CONFLICT (key) DO NOTHING;

-- ===================================================================
-- PART 13: RLS POLICIES FOR NEW TABLES
-- ===================================================================

ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_approval_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings_groups ENABLE ROW LEVEL SECURITY;

-- Public read for all configuration tables
CREATE POLICY "Public read document_categories" ON document_categories FOR SELECT USING (true);
CREATE POLICY "Public read configuration_categories" ON configuration_categories FOR SELECT USING (true);
CREATE POLICY "Public read configuration_history" ON configuration_history FOR SELECT USING (true);
CREATE POLICY "Public read member_compliance" ON member_compliance FOR SELECT USING (true);
CREATE POLICY "Public read member_approval_workflow" ON member_approval_workflow FOR SELECT USING (true);
CREATE POLICY "Public read file_uploads" ON file_uploads FOR SELECT USING (true);
CREATE POLICY "Public read settings_groups" ON settings_groups FOR SELECT USING (true);

-- Service role full access for all new tables
CREATE POLICY "Service role document_categories" ON document_categories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role configuration_categories" ON configuration_categories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role configuration_history" ON configuration_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role member_compliance" ON member_compliance FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role member_approval_workflow" ON member_approval_workflow FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role file_uploads" ON file_uploads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role settings_groups" ON settings_groups FOR ALL USING (auth.role() = 'service_role');

-- ===================================================================
-- COMPLETION
-- ===================================================================

-- Migration complete
-- Run the following in Supabase Dashboard or via CLI:
-- 1. Create storage buckets: documents, member-documents, loan-documents, audit-evidence
-- 2. Set up storage policies for authenticated access
-- 3. Configure RLS policies according to your security requirements
