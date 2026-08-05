-- ===================================================================
-- PHASE 5: ENTERPRISE DOCUMENT & MEDIA SERVICE - FULL INTEGRATION
-- 
-- This migration enhances the database schema to support the
-- centralized Enterprise Document & Media Service across all modules.
-- ===================================================================

-- ===================================================================
-- PART 1: ENHANCE DOCUMENTS TABLE
-- Add all fields needed for the centralized document service
-- ===================================================================

-- Core fields already exist from migration 007, adding additional fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_ref TEXT UNIQUE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'authenticated' CHECK (visibility IN ('public', 'authenticated', 'admin', 'owner'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_roles TEXT[] DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE documents ADD NOT EXISTS expiry_date TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_module ON documents(module);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(module, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_code);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_document_ref ON documents(document_ref);

-- Update existing documents with document_ref
UPDATE documents SET document_ref = 'DOC-' || UPPER(SUBSTRING(module FROM 1 FOR 3)) || '-' || TO_CHAR(UNIX_TIMESTAMP(created_at), 'FM999999999') || SUBSTR(MD5(id), 1, 6) WHERE document_ref IS NULL;

-- ===================================================================
-- PART 2: ADDITIONAL MODULE DOCUMENT CATEGORIES
-- Seed categories for all modules in YUNITE
-- ===================================================================

INSERT INTO document_categories (code, name, description, module, is_required, sort_order) VALUES
    -- User/Admin Documents
    ('user_avatar', 'Profile Photo', 'User or admin profile photograph', 'users', FALSE, 1),
    ('user_id_document', 'Identity Document', 'Government-issued identification', 'users', FALSE, 2),
    ('user_certificate', 'Professional Certificate', 'Professional qualification certificates', 'users', FALSE, 3),
    
    -- Organization Documents
    ('org_logo', 'Organization Logo', 'Official organization logo', 'organization', TRUE, 1),
    ('org_registration', 'Registration Certificate', 'Business registration certificate', 'organization', TRUE, 2),
    ('org_constitution', 'Constitution/Governance', 'Organization constitution or governance document', 'organization', TRUE, 3),
    ('org_license', 'Operating License', 'Operating license or permit', 'organization', FALSE, 4),
    ('org_branding', 'Branding Assets', 'Logo, colors, brand guidelines', 'organization', FALSE, 5),
    ('org_certificate', 'Certificate/Legal', 'Legal certificates and attestations', 'organization', FALSE, 6),
    
    -- Savings Documents
    ('savings_certificate', 'Savings Certificate', 'Official savings certificate', 'savings', FALSE, 1),
    ('savings_statement', 'Account Statement', 'Periodic account statements', 'savings', FALSE, 2),
    
    -- Contribution Documents
    ('contribution_receipt', 'Contribution Receipt', 'Official receipt for contributions', 'contributions', FALSE, 1),
    ('contribution_certificate', 'Contribution Certificate', 'Annual contribution certificate', 'contributions', FALSE, 2),
    
    -- Donation Documents
    ('donation_receipt', 'Donation Receipt', 'Official donation receipt', 'donations', TRUE, 1),
    ('donation_certificate', 'Tax Certificate', 'Tax deduction certificate', 'donations', FALSE, 2),
    ('donation_agreement', 'Donation Agreement', 'Formal donation agreement', 'donations', FALSE, 3),
    
    -- Investment Documents
    ('investment_proposal', 'Investment Proposal', 'Investment opportunity document', 'investments', TRUE, 1),
    ('investment_contract', 'Investment Contract', 'Signed investment contract', 'investments', TRUE, 2),
    ('investment_statement', 'Investment Statement', 'Periodic investment statements', 'investments', FALSE, 3),
    ('investment_return', 'Return Documentation', 'Investment return documentation', 'investments', FALSE, 4),
    
    -- Procurement Documents
    ('procurement_rfq', 'Request for Quotation', 'RFQ documents', 'procurement', TRUE, 1),
    ('procurement_quotation', 'Supplier Quotation', 'Supplier price quotation', 'procurement', TRUE, 2),
    ('procurement_order', 'Purchase Order', 'Approved purchase order', 'procurement', TRUE, 3),
    ('procurement_contract', 'Supply Contract', 'Supplier contract', 'procurement', FALSE, 4),
    ('procurement_invoice', 'Invoice', 'Supplier invoice', 'procurement', FALSE, 5),
    ('procurement_delivery', 'Delivery Note', 'Goods delivery note', 'procurement', FALSE, 6),
    
    -- Inventory Documents
    ('inventory_photo', 'Item Photograph', 'Photograph of inventory item', 'inventory', FALSE, 1),
    ('inventory_certificate', 'Ownership Certificate', 'Ownership or title certificate', 'inventory', FALSE, 2),
    ('inventory_appraisal', 'Appraisal Report', 'Professional appraisal report', 'inventory', FALSE, 3),
    
    -- Asset Documents
    ('asset_photo', 'Asset Photograph', 'Photograph of asset', 'assets', FALSE, 1),
    ('asset_title', 'Asset Title', 'Ownership or title document', 'assets', TRUE, 2),
    ('asset_insurance', 'Insurance Policy', 'Asset insurance policy', 'assets', FALSE, 3),
    ('asset_maintenance', 'Maintenance Record', 'Maintenance and repair records', 'assets', FALSE, 4),
    ('asset_depreciation', 'Depreciation Schedule', 'Asset depreciation schedule', 'assets', FALSE, 5),
    
    -- Event Documents
    ('event_poster', 'Event Poster', 'Event promotional poster', 'events', FALSE, 1),
    ('event_agenda', 'Event Agenda', 'Detailed event agenda', 'events', TRUE, 2),
    ('event_budget', 'Event Budget', 'Event budget document', 'events', TRUE, 3),
    ('event_report', 'Event Report', 'Post-event report', 'events', FALSE, 4),
    ('event_feedback', 'Feedback Summary', 'Attendee feedback summary', 'events', FALSE, 5),
    
    -- Report Documents
    ('report_financial', 'Financial Report', 'Financial statement or report', 'reports', FALSE, 1),
    ('report_audit', 'Audit Report', 'Audit findings report', 'reports', FALSE, 2),
    ('report_annual', 'Annual Report', 'Annual activity report', 'reports', FALSE, 3),
    ('report_compliance', 'Compliance Report', 'Regulatory compliance report', 'reports', FALSE, 4),
    ('report_performance', 'Performance Report', 'Performance analysis report', 'reports', FALSE, 5),
    
    -- AI Center Documents
    ('ai_analysis', 'AI Analysis Output', 'Result of AI analysis', 'ai_center', FALSE, 1),
    ('ai_model', 'AI Model Documentation', 'Model specification and training data', 'ai_center', FALSE, 2),
    ('ai_prediction', 'Prediction Report', 'AI-generated prediction report', 'ai_center', FALSE, 3),
    
    -- Notification Documents
    ('notification_attachment', 'Notification Attachment', 'File attached to notification', 'notifications', FALSE, 1),
    ('notification_template', 'Notification Template', 'Template document', 'notifications', FALSE, 2),
    
    -- Settings Documents
    ('settings_backup', 'Configuration Backup', 'System configuration backup', 'settings', FALSE, 1),
    ('settings_policy', 'Policy Document', 'Organization policy document', 'settings', FALSE, 2),
    
    -- Audit Documents
    ('audit_evidence', 'Audit Evidence', 'Evidence for audit purposes', 'audit', FALSE, 1),
    ('audit_report', 'Audit Working Paper', 'Audit working paper', 'audit', FALSE, 2),
    ('audit_certificate', 'Audit Certificate', 'External audit certificate', 'audit', FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- ===================================================================
-- PART 3: DOCUMENT EVENTS TABLE
-- Track all document-related events for audit and notifications
-- ===================================================================

CREATE TABLE IF NOT EXISTS document_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    document_ref TEXT,
    module TEXT NOT NULL,
    entity_id UUID NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    previous_status TEXT,
    new_status TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_events_type ON document_events(event_type);
CREATE INDEX IF NOT EXISTS idx_doc_events_document ON document_events(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_events_module ON document_events(module);
CREATE INDEX IF NOT EXISTS idx_doc_events_entity ON document_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_doc_events_actor ON document_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_doc_events_timestamp ON document_events(timestamp DESC);

-- ===================================================================
-- PART 4: DOCUMENT ACCESS LOGS
-- Track all document access for security auditing
-- ===================================================================

CREATE TABLE IF NOT EXISTS document_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    document_ref TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    access_type TEXT NOT NULL CHECK (access_type IN ('view', 'download', 'preview', 'print', 'share', 'embed')),
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_doc_access_document ON document_access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_user ON document_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_type ON document_access_logs(access_type);
CREATE INDEX IF NOT EXISTS idx_doc_access_timestamp ON document_access_logs(timestamp DESC);

-- ===================================================================
-- PART 5: ORGANIZATIONS TABLE ENHANCEMENTS
-- Add document-related fields to organizations
-- ===================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS certificate_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_colors JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS social_media JSONB DEFAULT '{}';

-- ===================================================================
-- PART 6: AUDIT LOGS ENHANCEMENT
-- Add document-specific audit fields
-- ===================================================================

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS document_ref TEXT;

-- ===================================================================
-- PART 7: ENHANCED RLS POLICIES FOR DOCUMENTS
-- ===================================================================

-- Documents: Public read for authenticated users
DROP POLICY IF EXISTS "Documents public read" ON documents;
CREATE POLICY "Documents public read" ON documents FOR SELECT 
    USING (
        visibility = 'public' 
        OR visibility = 'authenticated'
        OR uploaded_by = current_setting('request.jwt.claims', true)::json->>'user_id'
    );

-- Documents: Service role full access
DROP POLICY IF EXISTS "Documents service role" ON documents;
CREATE POLICY "Documents service role" ON documents FOR ALL 
    USING (auth.role() = 'service_role');

-- Documents: Insert for authenticated users
DROP POLICY IF EXISTS "Documents insert" ON documents;
CREATE POLICY "Documents insert" ON documents FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Document events: Public read
CREATE POLICY "Doc events public read" ON document_events FOR SELECT USING (true);

-- Document events: Service role write
CREATE POLICY "Doc events service role" ON document_events FOR ALL 
    USING (auth.role() = 'service_role');

-- Document access logs: Admin read
CREATE POLICY "Doc access admin read" ON document_access_logs FOR SELECT 
    USING (auth.role() = 'service_role');

-- Document access logs: Service role write
CREATE POLICY "Doc access service role" ON document_access_logs FOR ALL 
    USING (auth.role() = 'service_role');

-- ===================================================================
-- PART 8: FUNCTIONS FOR DOCUMENT SERVICE
-- ===================================================================

-- Function to log document events
CREATE OR REPLACE FUNCTION log_document_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO document_events (
        event_type,
        document_id,
        document_ref,
        module,
        entity_id,
        actor_id,
        actor_name,
        previous_status,
        new_status,
        metadata
    ) VALUES (
        TG_ARGV[0],
        NEW.id,
        NEW.document_ref,
        NEW.module,
        NEW.entity_id,
        NEW.uploaded_by,
        NEW.uploaded_by_name,
        OLD.status,
        NEW.status,
        jsonb_build_object(
            'file_name', NEW.file_name,
            'category_code', NEW.category_code,
            'triggered_by', TG_OP
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for document status changes
DROP TRIGGER IF EXISTS on_document_status_change ON documents;
CREATE TRIGGER on_document_status_change
    AFTER UPDATE OF status ON documents
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_document_event('document.status_changed');

-- Create trigger for new documents
DROP TRIGGER IF EXISTS on_document_created ON documents;
CREATE TRIGGER on_document_created
    AFTER INSERT ON documents
    FOR EACH ROW
    EXECUTE FUNCTION log_document_event('document.created');

-- Function to check document expiration
CREATE OR REPLACE FUNCTION check_document_expiration()
RETURNS void AS $$
BEGIN
    UPDATE documents 
    SET is_expired = TRUE 
    WHERE expiry_date IS NOT NULL 
    AND expiry_date < NOW() 
    AND is_expired = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate member compliance score
CREATE OR REPLACE FUNCTION calculate_member_compliance_score(member_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    required_count INTEGER;
    approved_count INTEGER;
    score INTEGER;
BEGIN
    -- Count required document categories for members
    SELECT COUNT(*) INTO required_count
    FROM document_categories
    WHERE module = 'members'
    AND is_required = TRUE
    AND is_active = TRUE;
    
    -- Count approved documents for this member
    SELECT COUNT(DISTINCT category_code) INTO approved_count
    FROM documents
    WHERE module = 'members'
    AND entity_id = member_uuid
    AND status = 'approved'
    AND is_archived = FALSE;
    
    -- Calculate score
    IF required_count = 0 OR required_count IS NULL THEN
        score := 100;
    ELSE
        score := ROUND((approved_count::NUMERIC / required_count::NUMERIC) * 100);
    END IF;
    
    RETURN COALESCE(score, 0);
END;
$$ LANGUAGE plpgsql;

-- Update member approval workflow with compliance score
CREATE OR REPLACE FUNCTION update_member_compliance_on_doc_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.module = 'members' AND NEW.entity_id IS NOT NULL THEN
        UPDATE member_approval_workflow
        SET 
            compliance_score = calculate_member_compliance_score(NEW.entity_id),
            required_documents_complete = calculate_member_compliance_score(NEW.entity_id) = 100,
            updated_at = NOW()
        WHERE member_id = NEW.entity_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for compliance score updates
DROP TRIGGER IF EXISTS on_member_doc_compliance ON documents;
CREATE TRIGGER on_member_doc_compliance
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW
    WHEN (NEW.module = 'members' OR OLD.module = 'members')
    EXECUTE FUNCTION update_member_compliance_on_doc_change();

-- ===================================================================
-- PART 9: SEED DEFAULT STORAGE BUCKETS
-- Note: These should be created in Supabase Storage dashboard
-- ===================================================================

-- Storage buckets configuration (create these in Supabase Dashboard):
-- 1. documents - General document storage
-- 2. member-documents - Member KYC and compliance documents
-- 3. user-documents - User profile photos and documents
-- 4. org-documents - Organization certificates and branding
-- 5. loan-documents - Loan agreements and collateral
-- 6. savings-documents - Savings certificates and statements
-- 7. contribution-documents - Contribution receipts
-- 8. welfare-documents - Welfare case documents
-- 9. donation-documents - Donation records
-- 10. investment-documents - Investment documents
-- 11. project-documents - Project proposals and reports
-- 12. meeting-documents - Meeting minutes and resolutions
-- 13. procurement-documents - Purchase orders and contracts
-- 14. inventory-documents - Inventory records
-- 15. asset-documents - Asset documentation
-- 16. event-documents - Event materials
-- 17. reports - Generated reports and statements
-- 18. ai-documents - AI analysis outputs
-- 19. notification-attachments - Notification files
-- 20. settings-documents - Configuration backups
-- 21. audit-evidence - Audit evidence
-- 22. financial-documents - Financial statements

-- ===================================================================
-- PART 10: INDEX OPTIMIZATION
-- ===================================================================

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_documents_entity_status 
    ON documents(module, entity_id, status) 
    WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_documents_category_status 
    ON documents(category_code, status) 
    WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_documents_expiring 
    ON documents(expiry_date) 
    WHERE expiry_date IS NOT NULL 
    AND is_archived = FALSE 
    AND is_expired = FALSE;

CREATE INDEX IF NOT EXISTS idx_documents_module_status 
    ON documents(module, status, uploaded_at DESC) 
    WHERE is_archived = FALSE;

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
