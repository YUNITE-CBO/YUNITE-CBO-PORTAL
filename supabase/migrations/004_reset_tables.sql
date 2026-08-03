-- YUNITE Enterprise Operating System
-- Migration 004: Tables for Database Reset Feature
-- 
-- This migration adds tables required for the database reset functionality
-- including meetings, notifications, reports, roles, permissions, archives,
-- and reset_reports tables.

-- ============================================
-- MEETINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_number TEXT UNIQUE NOT NULL,
    meeting_title TEXT NOT NULL,
    meeting_type TEXT CHECK (meeting_type IN ('general', 'agm', 'egm', 'committee', 'board')),
    scheduled_date TIMESTAMPTZ NOT NULL,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    venue TEXT,
    agenda TEXT,
    minutes TEXT,
    chairperson UUID REFERENCES members(id),
    secretary UUID REFERENCES members(id),
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- ============================================
-- MEETING ATTENDANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id),
    attended BOOLEAN DEFAULT FALSE,
    arrival_time TIMESTAMPTZ,
    departure_time TIMESTAMPTZ,
    excuse TEXT,
    is_excused BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_member ON meeting_attendance(member_id);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    member_id UUID REFERENCES members(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT CHECK (notification_type IN (
        'info', 'warning', 'error', 'success',
        'loan', 'contribution', 'fine', 'meeting',
        'reminder', 'alert', 'system'
    )),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_member ON notifications(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- REPORTS TABLE (AI Generated Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number TEXT UNIQUE NOT NULL,
    report_type TEXT CHECK (report_type IN (
        'financial_summary', 'loan_analysis', 'member_activity',
        'contribution_report', 'fine_report', 'attendance_report',
        'ai_insight', 'compliance_report', 'custom'
    )),
    title TEXT NOT NULL,
    description TEXT,
    content JSONB NOT NULL,
    generated_by UUID REFERENCES users(id),
    parameters JSONB DEFAULT '{}',
    period_start DATE,
    period_end DATE,
    status TEXT DEFAULT 'completed' CHECK (status IN ('generating', 'completed', 'failed')),
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_generated_by ON reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- ============================================
-- ROLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name TEXT UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(role_name);

-- Seed default roles
INSERT INTO roles (id, role_name, description, is_system_role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'super_admin', 'Full system access with all permissions', TRUE),
    ('00000000-0000-0000-0000-000000000002', 'admin', 'Administrative access to most features', TRUE),
    ('00000000-0000-0000-0000-000000000003', 'staff', 'Standard staff access', TRUE),
    ('00000000-0000-0000-0000-000000000004', 'viewer', 'Read-only access', TRUE)
ON CONFLICT (role_name) DO NOTHING;

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_name TEXT UNIQUE NOT NULL,
    description TEXT,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- Seed default permissions
INSERT INTO permissions (permission_name, description, module, action) VALUES
    ('members.view', 'View members', 'members', 'read'),
    ('members.create', 'Create members', 'members', 'create'),
    ('members.edit', 'Edit members', 'members', 'update'),
    ('members.delete', 'Delete members', 'members', 'delete'),
    ('loans.view', 'View loans', 'loans', 'read'),
    ('loans.create', 'Create loans', 'loans', 'create'),
    ('loans.approve', 'Approve loans', 'loans', 'approve'),
    ('loans.disburse', 'Disburse loans', 'loans', 'disburse'),
    ('transactions.view', 'View transactions', 'transactions', 'read'),
    ('transactions.create', 'Create transactions', 'transactions', 'create'),
    ('transactions.reverse', 'Reverse transactions', 'transactions', 'reverse'),
    ('settings.view', 'View settings', 'settings', 'read'),
    ('settings.edit', 'Edit settings', 'settings', 'update'),
    ('settings.reset', 'Reset database', 'settings', 'reset'),
    ('reports.view', 'View reports', 'reports', 'read'),
    ('reports.generate', 'Generate reports', 'reports', 'generate'),
    ('users.view', 'View users', 'users', 'read'),
    ('users.create', 'Create users', 'users', 'create'),
    ('users.edit', 'Edit users', 'users', 'update'),
    ('users.delete', 'Delete users', 'users', 'delete')
ON CONFLICT (permission_name) DO NOTHING;

-- ============================================
-- ARCHIVES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archive_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    records JSONB NOT NULL,
    reset_level TEXT,
    record_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archives_archive_id ON archives(archive_id);
CREATE INDEX IF NOT EXISTS idx_archives_table_name ON archives(table_name);
CREATE INDEX IF NOT EXISTS idx_archives_created_at ON archives(created_at DESC);

-- ============================================
-- RESET REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reset_reports (
    id UUID PRIMARY KEY,
    reset_level TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'archived')),
    initiated_by TEXT NOT NULL,
    initiated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    stats JSONB,
    backup_created BOOLEAN DEFAULT FALSE,
    phases_completed JSONB DEFAULT '[]',
    validation_passed BOOLEAN DEFAULT FALSE,
    validation_errors JSONB,
    system_state JSONB,
    archived BOOLEAN DEFAULT FALSE,
    archive_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_reports_level ON reset_reports(reset_level);
CREATE INDEX IF NOT EXISTS idx_reset_reports_status ON reset_reports(status);
CREATE INDEX IF NOT EXISTS idx_reset_reports_initiated_at ON reset_reports(initiated_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE reset_reports ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read meetings" ON meetings FOR SELECT USING (true);
CREATE POLICY "Public read attendance" ON meeting_attendance FOR SELECT USING (true);
CREATE POLICY "Public read notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Public read reports" ON reports FOR SELECT USING (true);
CREATE POLICY "Public read roles" ON roles FOR SELECT USING (true);
CREATE POLICY "Public read permissions" ON permissions FOR SELECT USING (true);
CREATE POLICY "Public read archives" ON archives FOR SELECT USING (true);
CREATE POLICY "Public read reset_reports" ON reset_reports FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "Service role meetings" ON meetings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role attendance" ON meeting_attendance FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role notifications" ON notifications FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role reports" ON reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role roles" ON roles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role permissions" ON permissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role archives" ON archives FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role reset_reports" ON reset_reports FOR ALL USING (auth.role() = 'service_role');

-- Public insert/update (service role bypasses RLS anyway)
CREATE POLICY "Public insert meetings" ON meetings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert attendance" ON meeting_attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert reports" ON reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert archives" ON archives FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert reset_reports" ON reset_reports FOR INSERT WITH CHECK (true);
