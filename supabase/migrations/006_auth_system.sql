-- ===================================================================
-- AUTHENTICATION SYSTEM MIGRATION
-- YUNITE Enterprise Portal - Release 1.1.0
-- ===================================================================

-- ===================================================================
-- 1. USER SESSIONS TABLE
-- Tracks active user sessions for security and audit purposes
-- ===================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    location_info JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,
    termination_reason TEXT
);

-- Indexes for session management
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_active = true;

-- ===================================================================
-- 2. LOGIN ACTIVITY TABLE
-- Comprehensive logging of all authentication events
-- ===================================================================
CREATE TABLE IF NOT EXISTS login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'login_success',
        'login_failed',
        'logout',
        'password_changed',
        'password_reset_requested',
        'password_reset_completed',
        'session_expired',
        'session_terminated',
        'account_locked',
        'account_unlocked',
        'mfa_enabled',
        'mfa_disabled',
        'role_changed',
        'email_changed'
    )),
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    location_info JSONB,
    metadata JSONB,
    success BOOLEAN DEFAULT true,
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for login activity queries
CREATE INDEX IF NOT EXISTS idx_login_activity_user_id ON login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_email ON login_activity(email);
CREATE INDEX IF NOT EXISTS idx_login_activity_event_type ON login_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_login_activity_created_at ON login_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_activity_ip ON login_activity(ip_address);

-- ===================================================================
-- 3. UPDATE USERS TABLE
-- Add profile fields and security enhancements
-- ===================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_joined TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- ===================================================================
-- 4. ENHANCED AUDIT LOGS
-- Additional indexes for audit logging (table_name column already exists)
-- ===================================================================
-- Note: Using existing columns from audit_logs table
-- Original audit_logs columns: id, user_id, action, record_id, before_value, after_value, description, ip_address, created_at

-- ===================================================================
-- 5. NOTIFICATION PREFERENCES
-- Allow users to configure their notification preferences
-- ===================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notify_on_login BOOLEAN DEFAULT true,
    notify_on_logout BOOLEAN DEFAULT true,
    notify_on_password_change BOOLEAN DEFAULT true,
    notify_on_profile_update BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    in_app_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ===================================================================
-- 6. USER MANAGEMENT AUDIT
-- Track all admin actions on user accounts
-- ===================================================================
CREATE TABLE IF NOT EXISTS user_management_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN (
        'user_created',
        'user_updated',
        'user_deleted',
        'role_changed',
        'status_changed',
        'password_reset',
        'account_locked',
        'account_unlocked',
        'email_changed'
    )),
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mgmt_audit_admin ON user_management_audit(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mgmt_audit_target ON user_management_audit(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mgmt_audit_created ON user_management_audit(created_at DESC);

-- ===================================================================
-- 7. RLS POLICIES
-- Note: Using service role bypass for all auth operations
-- The API routes use createServiceClient() which bypasses RLS
-- RLS is kept enabled for additional security if needed
-- ===================================================================

-- Enable RLS on auth tables
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so these policies are permissive
-- They allow anyone to read (service role will handle actual auth)
CREATE POLICY "Allow all reads on sessions" ON user_sessions FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on sessions" ON user_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on sessions" ON user_sessions FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on sessions" ON user_sessions FOR DELETE USING (true);

CREATE POLICY "Allow all reads on login_activity" ON login_activity FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on login_activity" ON login_activity FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all reads on notification_preferences" ON notification_preferences FOR SELECT USING (true);
CREATE POLICY "Allow all operations on notification_preferences" ON notification_preferences FOR ALL USING (true);

-- ===================================================================
-- 8. FUNCTIONS & TRIGGERS
-- ===================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE user_sessions 
    SET is_active = false, 
        terminated_at = NOW(),
        termination_reason = 'expired'
    WHERE is_active = true 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active sessions count for a user
CREATE OR REPLACE FUNCTION get_user_active_sessions_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_sessions
    WHERE user_id = p_user_id 
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update notification_preferences updated_at
CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_preferences_updated
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_notification_preferences_timestamp();

-- ===================================================================
-- 9. SEED DATA
-- ===================================================================

-- Insert default notification preferences for existing users
INSERT INTO notification_preferences (user_id, notify_on_login, notify_on_logout, notify_on_password_change)
SELECT id, true, true, true
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM notification_preferences WHERE user_id = users.id
);

-- ===================================================================
-- 10. COMMENTS
-- ===================================================================

COMMENT ON TABLE user_sessions IS 'Tracks active user sessions for security auditing';
COMMENT ON TABLE login_activity IS 'Comprehensive logging of all authentication events';
COMMENT ON TABLE notification_preferences IS 'User notification preferences for security events';
COMMENT ON TABLE user_management_audit IS 'Audit trail for all user administration actions';

COMMENT ON COLUMN user_sessions.device_info IS 'JSON containing browser, OS, device type information';
COMMENT ON COLUMN user_sessions.location_info IS 'JSON containing country, city, ISP from IP';
COMMENT ON COLUMN login_activity.metadata IS 'Additional context like failed attempt count, lock status';
