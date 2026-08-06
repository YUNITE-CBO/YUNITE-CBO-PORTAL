-- YUNITE Enterprise Operating System
-- Migration 011: Enhanced Member Profile & Lifecycle Management
-- 
-- Comprehensive member profile fields and lifecycle management

-- ============================================
-- 1. ENHANCED MEMBERS TABLE
-- ============================================
DO $$
BEGIN
    -- Add emergency contact fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'emergency_contact_name') THEN
        ALTER TABLE members ADD COLUMN emergency_contact_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'emergency_contact_phone') THEN
        ALTER TABLE members ADD COLUMN emergency_contact_phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'emergency_contact_relationship') THEN
        ALTER TABLE members ADD COLUMN emergency_contact_relationship TEXT;
    END IF;
    
    -- Add communication preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'preferred_language') THEN
        ALTER TABLE members ADD COLUMN preferred_language TEXT DEFAULT 'en';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'preferred_contact_method') THEN
        ALTER TABLE members ADD COLUMN preferred_contact_method TEXT DEFAULT 'phone';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'sms_notifications') THEN
        ALTER TABLE members ADD COLUMN sms_notifications BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'email_notifications') THEN
        ALTER TABLE members ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
    END IF;
    
    -- Add membership category and group
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'membership_category') THEN
        ALTER TABLE members ADD COLUMN membership_category TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'member_group') THEN
        ALTER TABLE members ADD COLUMN member_group TEXT;
    END IF;
    
    -- Add approval workflow fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'workflow_stage') THEN
        ALTER TABLE members ADD COLUMN workflow_stage TEXT DEFAULT 'registration';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'approved_by') THEN
        ALTER TABLE members ADD COLUMN approved_by UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'approved_at') THEN
        ALTER TABLE members ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'rejection_reason') THEN
        ALTER TABLE members ADD COLUMN rejection_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'suspension_reason') THEN
        ALTER TABLE members ADD COLUMN suspension_reason TEXT;
    END IF;
    
    -- Add profile photo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'profile_photo_url') THEN
        ALTER TABLE members ADD COLUMN profile_photo_url TEXT;
    END IF;
    
    -- Add alternative contact
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'alt_phone') THEN
        ALTER TABLE members ADD COLUMN alt_phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'alt_email') THEN
        ALTER TABLE members ADD COLUMN alt_email TEXT;
    END IF;
    
    -- Add marital status and nationality
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'marital_status') THEN
        ALTER TABLE members ADD COLUMN marital_status TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'nationality') THEN
        ALTER TABLE members ADD COLUMN nationality TEXT;
    END IF;
    
    -- Add notes field
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'admin_notes') THEN
        ALTER TABLE members ADD COLUMN admin_notes TEXT;
    END IF;
    
    -- Add kra_pin
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'kra_pin') THEN
        ALTER TABLE members ADD COLUMN kra_pin TEXT;
    END IF;
END $$;

-- ============================================
-- 2. MEMBER STATUS HISTORY TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_status_history') THEN
        CREATE TABLE member_status_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            previous_status TEXT,
            new_status TEXT NOT NULL,
            reason TEXT,
            changed_by UUID,
            changed_at TIMESTAMPTZ DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'
        );
        
        CREATE INDEX idx_member_status_history_member_id ON member_status_history(member_id);
        CREATE INDEX idx_member_status_history_changed_at ON member_status_history(changed_at);
    END IF;
END $$;

-- ============================================
-- 3. MEMBER COMMITTEES TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_committees') THEN
        CREATE TABLE member_committees (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            committee_name TEXT NOT NULL,
            role TEXT,
            start_date DATE,
            end_date DATE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX idx_member_committees_member_id ON member_committees(member_id);
    END IF;
END $$;

-- ============================================
-- 4. MEMBER PROJECTS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_projects') THEN
        CREATE TABLE member_projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            project_name TEXT NOT NULL,
            role TEXT,
            start_date DATE,
            end_date DATE,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX idx_member_projects_member_id ON member_projects(member_id);
    END IF;
END $$;

-- ============================================
-- 5. MEMBER MEETINGS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member_meetings') THEN
        CREATE TABLE member_meetings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            meeting_id UUID,
            attendance_status TEXT DEFAULT 'pending',
            present BOOLEAN DEFAULT FALSE,
            excuse TEXT,
            recorded_by UUID,
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX idx_member_meetings_member_id ON member_meetings(member_id);
    END IF;
END $$;

-- ============================================
-- 6. ENHANCED MEMBER_COMPLIANCE TABLE
-- ============================================
DO $$
BEGIN
    -- Add expiry tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_compliance' AND column_name = 'expiry_date') THEN
        ALTER TABLE member_compliance ADD COLUMN expiry_date TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_compliance' AND column_name = 'replacement_history') THEN
        ALTER TABLE member_compliance ADD COLUMN replacement_history JSONB DEFAULT '[]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_compliance' AND column_name = 'version') THEN
        ALTER TABLE member_compliance ADD COLUMN version INTEGER DEFAULT 1;
    END IF;
END $$;

-- ============================================
-- 7. MEMBER LOOKUP VIEW
-- ============================================
DROP VIEW IF EXISTS member_workspace_view CASCADE;
CREATE OR REPLACE VIEW member_workspace_view AS
SELECT 
    m.id,
    m.member_number,
    m.first_name,
    m.last_name,
    m.email,
    m.phone,
    m.status,
    m.workflow_stage,
    m.registration_date,
    m.profile_photo_url,
    
    -- Personal info
    m.date_of_birth,
    m.gender,
    m.marital_status,
    m.nationality,
    m.id_number,
    m.kra_pin,
    
    -- Compliance status
    (
        SELECT json_build_object(
            'compliance_score', COALESCE(maw.compliance_score, 0),
            'required_complete', COALESCE(maw.required_documents_complete, false),
            'current_stage', maw.current_stage
        )
        FROM member_approval_workflow maw
        WHERE maw.member_id = m.id
        LIMIT 1
    ) as compliance,
    
    -- Balances (computed)
    (
        SELECT json_build_object(
            'savings', COALESCE((SELECT SUM(CASE WHEN t.transaction_type LIKE 'savings_%' AND t.transaction_type NOT LIKE '%_withdrawal%' AND NOT t.reversed THEN t.amount - COALESCE((SELECT SUM(amount) FROM transactions t2 WHERE t2.member_id = t.member_id AND t2.account_id = t.account_id AND t2.transaction_type LIKE 'savings_withdrawal' AND t2.created_at <= t.created_at AND NOT t2.reversed), 0) END), 0), 0)
        )
    ) as balances,
    
    -- Document count
    (
        SELECT COUNT(*) 
        FROM documents d 
        WHERE d.member_id = m.id
    ) as document_count,
    
    -- Active loans count
    (
        SELECT COUNT(*) 
        FROM loans l 
        WHERE l.member_id = m.id AND l.status IN ('approved', 'disbursed', 'active')
    ) as active_loans_count,
    
    -- Created/updated
    m.created_at,
    m.updated_at
FROM members m;

-- ============================================
-- 8. FUNCTION: UPDATE MEMBER WORKFLOW STAGE
-- ============================================
CREATE OR REPLACE FUNCTION update_member_workflow_stage()
RETURNS TRIGGER AS $$
BEGIN
    -- Update workflow stage based on compliance status
    IF EXISTS (
        SELECT 1 FROM member_compliance mc
        JOIN document_categories dc ON dc.id = mc.document_category_id
        WHERE mc.member_id = NEW.id AND dc.is_required = true AND mc.status != 'approved'
    ) THEN
        -- Missing required documents
        UPDATE members SET workflow_stage = 'documentation' WHERE id = NEW.id;
    ELSIF EXISTS (
        SELECT 1 FROM member_compliance mc
        WHERE mc.member_id = NEW.id AND mc.status = 'under_review'
    ) THEN
        -- Under review
        UPDATE members SET workflow_stage = 'review' WHERE id = NEW.id;
    ELSE
        -- Ready for approval
        UPDATE members SET workflow_stage = 'approval' WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workflow stage updates
DROP TRIGGER IF EXISTS on_compliance_update ON member_compliance;
CREATE TRIGGER on_compliance_update
    AFTER UPDATE ON member_compliance
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_member_workflow_stage();

-- ============================================
-- 9. SEED DATA: Membership Categories
-- ============================================
DO $$
BEGIN
    INSERT INTO settings (key, value, category, description) VALUES
        ('member.categories', '["Regular","Premium","VIP","Corporate","Youth","Senior","Special"]', 'members', 'Available membership categories'),
        ('member.groups', '["Group A","Group B","Group C"]', 'members', 'Available member groups'),
        ('member.workflow_stages', '["registration","documentation","kyc_verification","compliance_review","approval","active"]', 'members', 'Workflow stages in order')
    ON CONFLICT (key) DO NOTHING;
END $$;

-- ============================================
-- 10. RLS POLICIES
-- ============================================
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'member_status_history';
    
    IF policy_count = 0 THEN
        ALTER TABLE member_status_history ENABLE ROW LEVEL SECURITY;
        ALTER TABLE member_committees ENABLE ROW LEVEL SECURITY;
        ALTER TABLE member_projects ENABLE ROW LEVEL SECURITY;
        ALTER TABLE member_meetings ENABLE ROW LEVEL SECURITY;
        
        -- Public read access
        CREATE POLICY "Public read member_status_history" ON member_status_history FOR SELECT USING (true);
        CREATE POLICY "Public read member_committees" ON member_committees FOR SELECT USING (true);
        CREATE POLICY "Public read member_projects" ON member_projects FOR SELECT USING (true);
        CREATE POLICY "Public read member_meetings" ON member_meetings FOR SELECT USING (true);
        
        -- Admin write access
        CREATE POLICY "Admin insert member_status_history" ON member_status_history FOR INSERT WITH CHECK (true);
        CREATE POLICY "Admin insert member_committees" ON member_committees FOR INSERT WITH CHECK (true);
        CREATE POLICY "Admin insert member_projects" ON member_projects FOR INSERT WITH CHECK (true);
        CREATE POLICY "Admin insert member_meetings" ON member_meetings FOR INSERT WITH CHECK (true);
        
        CREATE POLICY "Admin update member_status_history" ON member_status_history FOR UPDATE USING (true);
        CREATE POLICY "Admin update member_committees" ON member_committees FOR UPDATE USING (true);
        CREATE POLICY "Admin update member_projects" ON member_projects FOR UPDATE USING (true);
        CREATE POLICY "Admin update member_meetings" ON member_meetings FOR UPDATE USING (true);
        
        CREATE POLICY "Admin delete member_status_history" ON member_status_history FOR DELETE USING (true);
        CREATE POLICY "Admin delete member_committees" ON member_committees FOR DELETE USING (true);
        CREATE POLICY "Admin delete member_projects" ON member_projects FOR DELETE USING (true);
        CREATE POLICY "Admin delete member_meetings" ON member_meetings FOR DELETE USING (true);
    END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE member_status_history IS 'Tracks all status changes for members with audit trail';
COMMENT ON TABLE member_committees IS 'Member committee assignments';
COMMENT ON TABLE member_projects IS 'Member project participations';
COMMENT ON TABLE member_meetings IS 'Member meeting attendance records';
