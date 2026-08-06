-- =============================================
-- NOTIFICATION TABLES MIGRATION
-- =============================================
-- Run this SQL in your Supabase SQL Editor to create notification tables
-- https://sprlwlxjhhmazxpflhnb.supabase.co/project/-/sql
-- =============================================

-- 1. NOTIFICATION CHANNELS TABLE
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    requires_credentials BOOLEAN DEFAULT FALSE,
    config_schema JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default channels
INSERT INTO notification_channels (code, name, description, is_active) VALUES
    ('in_app', 'In-App Notification', 'Internal platform notifications', true),
    ('email', 'Email', 'SMTP email delivery', true),
    ('sms', 'SMS', 'SMS text messaging', false)
ON CONFLICT (code) DO NOTHING;

-- 2. NOTIFICATION CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS notification_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT DEFAULT '#3B82F6',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories
INSERT INTO notification_categories (code, name, description, icon, color, sort_order) VALUES
    ('member', 'Member Management', 'Member registration, status changes, documents', 'users', '#10B981', 1),
    ('savings', 'Savings', 'Deposits, withdrawals, adjustments', 'piggy-bank', '#3B82F6', 2),
    ('loans', 'Loans', 'Applications, approvals, disbursements, repayments', 'banknotes', '#F59E0B', 3),
    ('contributions', 'Contributions', 'Campaigns, payments, targets', 'heart', '#EC4899', 4),
    ('welfare', 'Welfare', 'Welfare deposits and disbursements', 'shield', '#8B5CF6', 5),
    ('fines', 'Fines', 'Fine issuance and payments', 'alert-triangle', '#EF4444', 6),
    ('meetings', 'Meetings', 'Meeting schedules and reminders', 'calendar', '#06B6D4', 7),
    ('reports', 'Reports', 'Statement generation and delivery', 'file-text', '#64748B', 8),
    ('system', 'System', 'System notifications and alerts', 'settings', '#6B7280', 9),
    ('security', 'Security', 'Security-related notifications', 'lock', '#DC2626', 10)
ON CONFLICT (code) DO NOTHING;

-- 3. NOTIFICATION TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES notification_categories(id),
    channels TEXT[] DEFAULT ARRAY['in_app']::TEXT[],
    subject_template TEXT NOT NULL,
    subject_variables TEXT[] DEFAULT '{}',
    body_template TEXT NOT NULL,
    body_variables TEXT[] DEFAULT '{}',
    html_body_template TEXT,
    html_body_variables TEXT[] DEFAULT '{}',
    priority TEXT DEFAULT 'normal',
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES notification_templates(id),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. NOTIFICATIONS TABLE (MAIN TABLE)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_ref TEXT UNIQUE NOT NULL,
    template_id UUID REFERENCES notification_templates(id),
    template_code TEXT,
    category_id UUID REFERENCES notification_categories(id),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    rendered_variables JSONB DEFAULT '{}',
    priority TEXT DEFAULT 'normal',
    recipient_type TEXT NOT NULL,
    recipient_id UUID,
    recipient_email TEXT,
    recipient_phone TEXT,
    recipient_name TEXT,
    source_module TEXT,
    source_entity_type TEXT,
    source_entity_id UUID,
    source_action TEXT,
    status TEXT DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    idempotency_key TEXT UNIQUE,
    actor_id UUID,
    actor_type TEXT,
    actor_name TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EMAIL QUEUE TABLE
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id),
    to_email TEXT NOT NULL,
    to_name TEXT,
    cc_email TEXT[],
    bcc_email TEXT[],
    from_email TEXT,
    from_name TEXT,
    reply_to TEXT,
    subject TEXT NOT NULL,
    html_body TEXT,
    text_body TEXT,
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    smtp_message_id TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    member_id UUID,
    notify_on_login BOOLEAN DEFAULT TRUE,
    notify_on_logout BOOLEAN DEFAULT TRUE,
    notify_on_transaction BOOLEAN DEFAULT TRUE,
    notify_on_loan BOOLEAN DEFAULT TRUE,
    notify_on_meeting BOOLEAN DEFAULT TRUE,
    notify_on_document BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    in_app_notifications BOOLEAN DEFAULT TRUE,
    marketing_notifications BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 7. NOTIFICATION DELIVERY HISTORY TABLE
CREATE TABLE IF NOT EXISTS notification_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id),
    email_queue_id UUID REFERENCES email_queue(id),
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT,
    body_preview TEXT,
    status TEXT DEFAULT 'pending',
    queued_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    smtp_response TEXT,
    error_message TEXT,
    tracking_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. NOTIFICATION SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS notification_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES notification_categories(id),
    schedule_type TEXT NOT NULL,
    cron_expression TEXT,
    scheduled_time TIME,
    timezone TEXT DEFAULT 'Africa/Nairobi',
    start_date DATE,
    end_date DATE,
    template_id UUID REFERENCES notification_templates(id),
    conditions JSONB DEFAULT '{}',
    recipient_type TEXT NOT NULL,
    recipient_filter JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. NOTIFICATION STATEMENTS TABLE
CREATE TABLE IF NOT EXISTS notification_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_ref TEXT UNIQUE NOT NULL,
    member_id UUID NOT NULL,
    statement_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    file_url TEXT,
    file_size INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. NOTIFICATION EVENT LOGS TABLE
CREATE TABLE IF NOT EXISTS notification_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    source_module TEXT,
    source_entity_type TEXT,
    source_entity_id UUID,
    event_data JSONB DEFAULT '{}',
    recipient_type TEXT,
    recipient_id UUID,
    notification_id UUID REFERENCES notifications(id),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(notification_ref);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_notification ON email_queue(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_history_notification ON notification_delivery_history(notification_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON notification_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_event_logs_processed ON notification_event_logs(processed) WHERE processed = false;

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Public read notifications" ON notifications;
CREATE POLICY "Public read notifications" ON notifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert notifications" ON notifications;
CREATE POLICY "Public insert notifications" ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read templates" ON notification_templates;
CREATE POLICY "Public read templates" ON notification_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read schedules" ON notification_schedules;
CREATE POLICY "Public read schedules" ON notification_schedules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read preferences" ON notification_preferences;
CREATE POLICY "Public read preferences" ON notification_preferences FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read delivery history" ON notification_delivery_history;
CREATE POLICY "Public read delivery history" ON notification_delivery_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read event logs" ON notification_event_logs;
CREATE POLICY "Public read event logs" ON notification_event_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read email queue" ON email_queue;
CREATE POLICY "Public read email queue" ON email_queue FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert notifications" ON notifications;
CREATE POLICY "Public insert notifications" ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert event logs" ON notification_event_logs;
CREATE POLICY "Public insert event logs" ON notification_event_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert email queue" ON email_queue;
CREATE POLICY "Public insert email queue" ON email_queue FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert delivery history" ON notification_delivery_history;
CREATE POLICY "Public insert delivery history" ON notification_delivery_history FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert preferences" ON notification_preferences;
CREATE POLICY "Public insert preferences" ON notification_preferences FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert statements" ON notification_statements;
CREATE POLICY "Public insert statements" ON notification_statements FOR INSERT WITH CHECK (true);

-- Verify tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'notification%';
