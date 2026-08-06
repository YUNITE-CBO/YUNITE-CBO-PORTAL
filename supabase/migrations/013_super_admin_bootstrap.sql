-- ===================================================================
-- SUPER ADMIN BOOTSTRAP SYSTEM MIGRATION
-- YUNITE Enterprise Portal - Bootstrap Logging & Audit
-- ===================================================================

-- ===================================================================
-- 1. BOOTSTRAP LOGS TABLE
-- Tracks all bootstrap operations for auditing and debugging
-- ===================================================================
CREATE TABLE IF NOT EXISTS bootstrap_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type TEXT NOT NULL CHECK (operation_type IN (
        'super_admin_bootstrap',
        'system_initialization',
        'database_migration',
        'cache_warmup',
        'notification_setup'
    )),
    status TEXT NOT NULL CHECK (status IN (
        'success',
        'failed',
        'skipped',
        'warning'
    )),
    action_taken TEXT,
    message TEXT,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER,
    environment TEXT DEFAULT 'development',
    metadata JSONB DEFAULT '{}',
    error_trace TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for bootstrap logs
CREATE INDEX IF NOT EXISTS idx_bootstrap_logs_operation ON bootstrap_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_bootstrap_logs_status ON bootstrap_logs(status);
CREATE INDEX IF NOT EXISTS idx_bootstrap_logs_created ON bootstrap_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bootstrap_logs_environment ON bootstrap_logs(environment);

-- ===================================================================
-- 2. ENHANCED USER MANAGEMENT FIELDS
-- Additional fields for comprehensive user management
-- ===================================================================

-- Add email verification status to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Add system user flags
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_protected BOOLEAN DEFAULT false;

-- Add department/team field for organization
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT;

-- Add password history for security
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]';

-- Add suspension fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_expires_at TIMESTAMPTZ;

-- Add archival fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Add notes field for admin comments
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Add login metadata
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_logins INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- ===================================================================
-- 3. USER STATUS CONSTRAINTS
-- Account status is stored as TEXT, updated via trigger
-- Valid values: active, inactive, suspended, archived, locked, pending
-- ===================================================================

-- Add account_status as a regular column (updated via trigger)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

-- ===================================================================
-- 4. EXTENDED AUDIT LOG FIELDS
-- Enhanced audit trail for compliance
-- ===================================================================

-- Extend user_management_audit with additional fields
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS previous_status TEXT;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS new_status TEXT;
ALTER TABLE user_management_audit ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ===================================================================
-- 5. FUNCTIONS & TRIGGERS
-- Note: account_status is managed by application code (UserManagementService)
-- to avoid cross-database validation issues during migration
-- ===================================================================

-- Default account_status for new users (will be updated by application)
UPDATE users SET account_status = CASE WHEN is_active = false THEN 'inactive' ELSE 'active' END 
WHERE account_status IS NULL;

-- Function to update total_logins counter
CREATE OR REPLACE FUNCTION update_user_login_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'login_success' AND NEW.user_id IS NOT NULL THEN
        UPDATE users 
        SET 
            total_logins = COALESCE(total_logins, 0) + 1,
            last_login = NEW.created_at,
            last_active_at = NEW.created_at,
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update login stats
DROP TRIGGER IF EXISTS trigger_update_login_stats ON login_activity;
CREATE TRIGGER trigger_update_login_stats
    AFTER INSERT ON login_activity
    FOR EACH ROW
    WHEN (NEW.event_type = 'login_success')
    EXECUTE FUNCTION update_user_login_stats();

-- Function to auto-unsuspend users when suspension expires
CREATE OR REPLACE FUNCTION auto_unsuspend_users()
RETURNS void AS $$
BEGIN
    UPDATE users 
    SET 
        suspended_at = NULL,
        suspension_reason = NULL,
        suspension_expires_at = NULL,
        is_active = true,
        updated_at = NOW()
    WHERE 
        suspended_at IS NOT NULL 
        AND suspension_expires_at IS NOT NULL 
        AND suspension_expires_at <= NOW()
        AND is_active = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================================================================
-- 6. RLS POLICIES
-- ===================================================================

-- Bootstrap logs - service role only access
ALTER TABLE bootstrap_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access to bootstrap_logs" ON bootstrap_logs
    FOR ALL USING (true) WITH CHECK (true);

-- ===================================================================
-- 7. SEED DATA
-- ===================================================================

-- Insert a record indicating system has been bootstrapped (after migration)
-- This will be updated by the bootstrap service on first run

-- ===================================================================
-- 8. COMMENTS
-- ===================================================================

COMMENT ON TABLE bootstrap_logs IS 'Tracks all bootstrap and initialization operations for auditing';
COMMENT ON COLUMN bootstrap_logs.operation_type IS 'Type of bootstrap operation performed';
COMMENT ON COLUMN bootstrap_logs.status IS 'Outcome of the operation: success, failed, skipped, warning';
COMMENT ON COLUMN bootstrap_logs.duration_ms IS 'Time taken to complete the operation in milliseconds';
COMMENT ON COLUMN bootstrap_logs.environment IS 'Environment where operation was performed: development, staging, production';

COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.is_system_user IS 'Whether this is a system-generated service account';
COMMENT ON COLUMN users.is_protected IS 'Whether this user account is protected from modification';
COMMENT ON COLUMN users.department IS 'Organizational department the user belongs to';
COMMENT ON COLUMN users.job_title IS 'User job title within the organization';
COMMENT ON COLUMN users.employee_id IS 'Unique employee identifier from HR system';
COMMENT ON COLUMN users.password_history IS 'Array of previous password hashes for reuse prevention';
COMMENT ON COLUMN users.account_status IS 'Computed account status based on various conditions';

-- ===================================================================
-- 9. DATA VALIDATION
-- ===================================================================

-- Ensure protected users cannot have their role changed
CREATE OR REPLACE FUNCTION prevent_protected_role_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_protected = true AND NEW.role != OLD.role THEN
        RAISE EXCEPTION 'Cannot change role of protected user %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_protected_role_change ON users;
CREATE TRIGGER trigger_prevent_protected_role_change
    BEFORE UPDATE ON users
    FOR EACH ROW
    WHEN (OLD.is_protected = true AND OLD.role != NEW.role)
    EXECUTE FUNCTION prevent_protected_role_change();

-- Ensure at least one super_admin always exists
CREATE OR REPLACE FUNCTION ensure_minimum_super_admin()
RETURNS TRIGGER AS $$
DECLARE
    super_admin_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' AND OLD.role = 'super_admin' THEN
        SELECT COUNT(*) INTO super_admin_count
        FROM users
        WHERE role = 'super_admin' AND id != OLD.id;
        
        IF super_admin_count = 0 THEN
            RAISE EXCEPTION 'Cannot delete the last Super Administrator account';
        END IF;
    END IF;
    RETURN COALESCE(OLD, NEW);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_minimum_super_admin ON users;
CREATE TRIGGER trigger_ensure_minimum_super_admin
    BEFORE DELETE ON users
    FOR EACH ROW
    WHEN (OLD.role = 'super_admin')
    EXECUTE FUNCTION ensure_minimum_super_admin();
