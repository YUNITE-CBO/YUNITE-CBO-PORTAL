-- YUNITE Enterprise Operating System
-- Migration 005: Enterprise Notification & Communication Engine
-- 
-- Centralized notification system for all modules
-- This migration is idempotent and can be run multiple times safely

-- ============================================
-- 1. NOTIFICATION CHANNELS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_channels') THEN
        CREATE TABLE notification_channels (
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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_channels_code ON notification_channels(code);

-- ============================================
-- 2. NOTIFICATION CATEGORIES TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_categories') THEN
        CREATE TABLE notification_categories (
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
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_categories_code ON notification_categories(code);

-- ============================================
-- 3. NOTIFICATION TEMPLATES TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_templates') THEN
        CREATE TABLE notification_templates (
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
        
        -- Create trigger for updated_at
        CREATE TRIGGER update_notification_templates_updated_at 
            BEFORE UPDATE ON notification_templates
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON notification_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_notification_templates_category ON notification_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON notification_templates(is_active);

-- ============================================
-- 4. NOTIFICATION SCHEDULES TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_schedules') THEN
        CREATE TABLE notification_schedules (
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
        
        CREATE TRIGGER update_notification_schedules_updated_at 
            BEFORE UPDATE ON notification_schedules
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_schedules_code ON notification_schedules(schedule_code);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_active ON notification_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_schedules_next_run ON notification_schedules(next_run_at);

-- ============================================
-- 5. NOTIFICATIONS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
        CREATE TABLE notifications (
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
            max_retries INTEGER DEFAULT 3,
            idempotency_key TEXT UNIQUE,
            actor_id UUID,
            actor_type TEXT,
            actor_name TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE TRIGGER update_notifications_updated_at 
            BEFORE UPDATE ON notifications
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ELSE
        -- Add missing columns if they don't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'recipient_id') THEN
            ALTER TABLE notifications ADD COLUMN recipient_id UUID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'recipient_email') THEN
            ALTER TABLE notifications ADD COLUMN recipient_email TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'recipient_name') THEN
            ALTER TABLE notifications ADD COLUMN recipient_name TEXT;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source_module, source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category_id);

-- ============================================
-- 6. EMAIL QUEUE TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_queue') THEN
        CREATE TABLE email_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            notification_id UUID REFERENCES notifications(id),
            to_email TEXT NOT NULL,
            to_name TEXT,
            cc_email TEXT[],
            bcc_email TEXT[],
            subject TEXT NOT NULL,
            html_body TEXT,
            text_body TEXT,
            from_email TEXT,
            from_name TEXT,
            reply_to TEXT,
            attachments JSONB DEFAULT '[]',
            priority INTEGER DEFAULT 5,
            max_retries INTEGER DEFAULT 3,
            retry_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            scheduled_for TIMESTAMPTZ DEFAULT NOW(),
            processing_started_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ,
            error_message TEXT,
            last_attempt_at TIMESTAMPTZ,
            smtp_message_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE TRIGGER update_email_queue_updated_at 
            BEFORE UPDATE ON email_queue
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_queue_notification ON email_queue(notification_id);

-- ============================================
-- 7. NOTIFICATION PREFERENCES TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_preferences') THEN
        CREATE TABLE notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_type TEXT NOT NULL,
            owner_id UUID NOT NULL,
            channels JSONB DEFAULT '{"in_app": true, "email": true, "sms": false}',
            enabled_categories UUID[] DEFAULT '{}',
            disabled_categories UUID[] DEFAULT '{}',
            quiet_hours_enabled BOOLEAN DEFAULT FALSE,
            quiet_hours_start TIME,
            quiet_hours_end TIME,
            quiet_hours_timezone TEXT DEFAULT 'Africa/Nairobi',
            digest_frequency TEXT DEFAULT 'immediate',
            email_format TEXT DEFAULT 'html',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(owner_type, owner_id)
        );
        
        CREATE TRIGGER update_notification_preferences_updated_at 
            BEFORE UPDATE ON notification_preferences
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_prefs_owner ON notification_preferences(owner_type, owner_id);

-- ============================================
-- 8. NOTIFICATION DELIVERY HISTORY TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_delivery_history') THEN
        CREATE TABLE notification_delivery_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            notification_id UUID REFERENCES notifications(id),
            email_queue_id UUID REFERENCES email_queue(id),
            channel TEXT NOT NULL,
            recipient TEXT NOT NULL,
            recipient_name TEXT,
            subject TEXT,
            body_preview TEXT,
            status TEXT NOT NULL,
            queued_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ,
            opened_at TIMESTAMPTZ,
            clicked_at TIMESTAMPTZ,
            bounced_at TIMESTAMPTZ,
            failed_at TIMESTAMPTZ,
            error_code TEXT,
            error_message TEXT,
            smtp_response TEXT,
            tracking_id TEXT,
            ip_address TEXT,
            user_agent TEXT,
            retry_count INTEGER DEFAULT 0,
            retry_history JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_history_notification ON notification_delivery_history(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_history_status ON notification_delivery_history(status);
CREATE INDEX IF NOT EXISTS idx_delivery_history_recipient ON notification_delivery_history(recipient);
CREATE INDEX IF NOT EXISTS idx_delivery_history_created ON notification_delivery_history(created_at DESC);

-- ============================================
-- 9. NOTIFICATION STATEMENTS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_statements') THEN
        CREATE TABLE notification_statements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            statement_ref TEXT UNIQUE NOT NULL,
            statement_type TEXT NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            recipient_type TEXT NOT NULL,
            recipient_id UUID,
            recipient_email TEXT,
            recipient_name TEXT,
            title TEXT NOT NULL,
            summary JSONB DEFAULT '{}',
            generated_data JSONB NOT NULL,
            file_path TEXT,
            file_size INTEGER,
            mime_type TEXT DEFAULT 'application/pdf',
            status TEXT DEFAULT 'pending',
            email_sent BOOLEAN DEFAULT FALSE,
            email_sent_at TIMESTAMPTZ,
            download_count INTEGER DEFAULT 0,
            last_downloaded_at TIMESTAMPTZ,
            schedule_id UUID REFERENCES notification_schedules(id),
            schedule_run_id TEXT,
            error_message TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE TRIGGER update_notification_statements_updated_at 
            BEFORE UPDATE ON notification_statements
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_statements_type ON notification_statements(statement_type);
CREATE INDEX IF NOT EXISTS idx_notification_statements_recipient ON notification_statements(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_statements_period ON notification_statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notification_statements_status ON notification_statements(status);

-- ============================================
-- 10. NOTIFICATION EVENT LOGS TABLE
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_event_logs') THEN
        CREATE TABLE notification_event_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_id TEXT UNIQUE NOT NULL,
            event_type TEXT NOT NULL,
            event_action TEXT NOT NULL,
            source_module TEXT NOT NULL,
            entity_type TEXT,
            entity_id UUID,
            event_data JSONB NOT NULL DEFAULT '{}',
            processed_data JSONB DEFAULT '{}',
            actor_id UUID,
            actor_type TEXT,
            actor_name TEXT,
            status TEXT DEFAULT 'pending',
            matched_templates UUID[] DEFAULT '{}',
            created_notifications UUID[] DEFAULT '{}',
            processing_error TEXT,
            received_at TIMESTAMPTZ DEFAULT NOW(),
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_event_logs_event ON notification_event_logs(event_type, event_action);
CREATE INDEX IF NOT EXISTS idx_notification_event_logs_source ON notification_event_logs(source_module);
CREATE INDEX IF NOT EXISTS idx_notification_event_logs_entity ON notification_event_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_event_logs_status ON notification_event_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_event_logs_received ON notification_event_logs(received_at DESC);

-- ============================================
-- 11. SEED DEFAULT TEMPLATES
-- ============================================
DO $$
BEGIN
    -- Only seed if table exists and is empty
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_templates') 
       AND NOT EXISTS (SELECT 1 FROM notification_templates LIMIT 1) THEN
        
        INSERT INTO notification_templates (template_code, name, description, channels, subject_template, subject_variables, body_template, body_variables, priority) VALUES
        -- Member templates
        ('member.registered', 'Member Registration', 'Notify admin of new member registration', ARRAY['in_app', 'email'], 'New Member Registration: {{member_name}}', ARRAY['member_name'], 'A new member has registered in the system.\n\nMember Name: {{member_name}}\nMember Number: {{member_number}}\nPhone: {{phone}}\nEmail: {{email}}\nRegistration Date: {{registration_date}}', ARRAY['member_name', 'member_number', 'phone', 'email', 'registration_date'], 'normal'),
        ('member.approved', 'Member Approval', 'Notify member of approval', ARRAY['in_app', 'email'], 'Welcome to {{organization_name}}, {{member_name}}!', ARRAY['member_name', 'organization_name'], 'Congratulations {{member_name}}!\n\nYour membership has been approved. Welcome to {{organization_name}}!\n\nMember Number: {{member_number}}\nRegistration Date: {{registration_date}}', ARRAY['member_name', 'organization_name', 'member_number', 'registration_date'], 'normal'),
        ('member.suspended', 'Member Suspension', 'Notify member of suspension', ARRAY['in_app', 'email'], 'Account Suspension Notice', ARRAY[], 'Dear {{member_name}},\n\nYour account has been temporarily suspended.\n\nReason: {{reason}}\nEffective Date: {{effective_date}}', ARRAY['member_name', 'reason', 'effective_date'], 'high'),
        
        -- Savings templates
        ('savings.deposit', 'Savings Deposit', 'Notify member of deposit', ARRAY['in_app', 'email'], 'Deposit Confirmation - {{currency}} {{amount}}', ARRAY['amount', 'currency'], 'Dear {{member_name}},\n\nYour deposit has been received.\n\nAmount: {{currency}} {{amount}}\nNew Balance: {{currency}} {{new_balance}}\nReference: {{transaction_ref}}\nDate: {{date}}', ARRAY['member_name', 'amount', 'currency', 'new_balance', 'transaction_ref', 'date'], 'normal'),
        ('savings.withdrawal', 'Savings Withdrawal', 'Notify member of withdrawal', ARRAY['in_app', 'email'], 'Withdrawal Confirmation - {{currency}} {{amount}}', ARRAY['amount', 'currency'], 'Dear {{member_name}},\n\nYour withdrawal has been processed.\n\nAmount: {{currency}} {{amount}}\nRemaining Balance: {{currency}} {{new_balance}}\nReference: {{transaction_ref}}\nDate: {{date}}', ARRAY['member_name', 'amount', 'currency', 'new_balance', 'transaction_ref', 'date'], 'normal'),
        
        -- Loan templates
        ('loan.application_received', 'Loan Application Received', 'Notify admin of loan application', ARRAY['in_app', 'email'], 'New Loan Application - {{loan_number}}', ARRAY['loan_number'], 'A new loan application has been submitted.\n\nLoan Number: {{loan_number}}\nMember: {{member_name}}\nAmount: {{currency}} {{amount}}\nType: {{loan_type}}\nApplied: {{application_date}}', ARRAY['loan_number', 'member_name', 'amount', 'currency', 'loan_type', 'application_date'], 'normal'),
        ('loan.approved', 'Loan Approved', 'Notify member of loan approval', ARRAY['in_app', 'email'], 'Loan Approved - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nYour loan application has been approved!\n\nLoan Number: {{loan_number}}\nPrincipal: {{currency}} {{principal_amount}}\nInterest: {{currency}} {{interest_amount}}\nTotal Amount: {{currency}} {{total_amount}}\nMonthly Repayment: {{currency}} {{monthly_repayment}}\nApproval Date: {{approval_date}}', ARRAY['member_name', 'loan_number', 'principal_amount', 'currency', 'interest_amount', 'total_amount', 'monthly_repayment', 'approval_date'], 'high'),
        ('loan.rejected', 'Loan Rejected', 'Notify member of loan rejection', ARRAY['in_app', 'email'], 'Loan Application Update - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nWe regret to inform you that your loan application has been declined.\n\nLoan Number: {{loan_number}}\nReason: {{rejection_reason}}\nDate: {{rejection_date}}', ARRAY['member_name', 'loan_number', 'rejection_reason', 'rejection_date'], 'normal'),
        ('loan.disbursed', 'Loan Disbursed', 'Notify member of loan disbursement', ARRAY['in_app', 'email'], 'Loan Disbursed - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nYour loan has been disbursed.\n\nLoan Number: {{loan_number}}\nAmount Disbursed: {{currency}} {{amount}}\nDisbursement Date: {{disbursement_date}}\nRepayment Starts: {{repayment_start_date}}\nMonthly Payment: {{currency}} {{monthly_repayment}}', ARRAY['member_name', 'loan_number', 'amount', 'currency', 'disbursement_date', 'repayment_start_date', 'monthly_repayment'], 'high'),
        ('loan.repayment_reminder', 'Loan Repayment Reminder', 'Remind member of upcoming payment', ARRAY['in_app', 'email'], 'Loan Payment Reminder - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nThis is a reminder for your upcoming loan payment.\n\nLoan Number: {{loan_number}}\nAmount Due: {{currency}} {{amount_due}}\nDue Date: {{due_date}}\nRemaining Balance: {{currency}} {{remaining_balance}}', ARRAY['member_name', 'loan_number', 'amount_due', 'currency', 'due_date', 'remaining_balance'], 'normal'),
        ('loan.overdue', 'Loan Overdue Notice', 'Notify member of overdue payment', ARRAY['in_app', 'email'], 'URGENT: Loan Payment Overdue - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nYour loan payment is overdue.\n\nLoan Number: {{loan_number}}\nAmount Overdue: {{currency}} {{amount_overdue}}\nDays Overdue: {{days_overdue}}\nPlease make payment immediately to avoid penalties.', ARRAY['member_name', 'loan_number', 'amount_overdue', 'currency', 'days_overdue'], 'urgent'),
        ('loan.repayment_complete', 'Loan Repayment Complete', 'Notify member of completed repayment', ARRAY['in_app', 'email'], 'Loan Fully Repaid - {{loan_number}}', ARRAY['loan_number'], 'Dear {{member_name}},\n\nCongratulations! Your loan has been fully repaid.\n\nLoan Number: {{loan_number}}\nTotal Repaid: {{currency}} {{total_repaid}}\nCompletion Date: {{completion_date}}\nThank you for your timely payments!', ARRAY['member_name', 'loan_number', 'total_repaid', 'currency', 'completion_date'], 'normal'),
        
        -- Fine templates
        ('fine.issued', 'Fine Issued', 'Notify member of fine', ARRAY['in_app', 'email'], 'Fine Issued - {{fine_number}}', ARRAY['fine_number'], 'Dear {{member_name}},\n\nA fine has been issued to your account.\n\nFine Number: {{fine_number}}\nAmount: {{currency}} {{amount}}\nReason: {{reason}}\nDue Date: {{due_date}}', ARRAY['member_name', 'fine_number', 'amount', 'currency', 'reason', 'due_date'], 'normal'),
        ('fine.paid', 'Fine Payment', 'Notify member of fine payment', ARRAY['in_app', 'email'], 'Fine Payment Receipt - {{fine_number}}', ARRAY['fine_number'], 'Dear {{member_name}},\n\nYour fine has been paid.\n\nFine Number: {{fine_number}}\nAmount Paid: {{currency}} {{amount_paid}}\nRemaining Balance: {{currency}} {{remaining_balance}}', ARRAY['member_name', 'fine_number', 'amount_paid', 'currency', 'remaining_balance'], 'normal'),
        
        -- Statement templates
        ('statement.monthly', 'Monthly Statement', 'Monthly statement notification', ARRAY['in_app', 'email'], '{{organization_name}} - Monthly Statement - {{period}}', ARRAY['organization_name', 'period'], 'Dear {{member_name}},\n\nYour monthly statement for {{period}} is now available.\n\nOrganization: {{organization_name}}\nPeriod: {{period_start}} to {{period_end}}\n\nSummary:\n- Opening Balance: {{currency}} {{opening_balance}}\n- Total Deposits: {{currency}} {{total_deposits}}\n- Total Withdrawals: {{currency}} {{total_withdrawals}}\n- Closing Balance: {{currency}} {{closing_balance}}\n\nPlease log in to view the full statement.', ARRAY['member_name', 'organization_name', 'period', 'period_start', 'period_end', 'currency', 'opening_balance', 'total_deposits', 'total_withdrawals', 'closing_balance'], 'normal'),
        ('statement.loan', 'Loan Statement', 'Loan statement notification', ARRAY['in_app', 'email'], '{{organization_name}} - Loan Statement - {{period}}', ARRAY['organization_name', 'period'], 'Dear {{member_name}},\n\nYour loan statement for {{period}} is now available.\n\nLoan Number: {{loan_number}}\nPeriod: {{period_start}} to {{period_end}}\n\nOpening Balance: {{currency}} {{opening_balance}}\nDisbursements: {{currency}} {{disbursements}}\nRepayments: {{currency}} {{repayments}}\nClosing Balance: {{currency}} {{closing_balance}}', ARRAY['member_name', 'organization_name', 'loan_number', 'period', 'period_start', 'period_end', 'currency', 'opening_balance', 'disbursements', 'repayments', 'closing_balance'], 'normal'),
        
        -- System templates
        ('system.maintenance', 'System Maintenance', 'System maintenance notice', ARRAY['in_app', 'email'], 'Scheduled Maintenance Notice', ARRAY[], '{{message}}\n\nDate: {{date}}\nDuration: {{duration}}', ARRAY['message', 'date', 'duration'], 'high'),
        ('system.welcome', 'Welcome Message', 'Welcome new user', ARRAY['in_app', 'email'], 'Welcome to {{organization_name}}', ARRAY['organization_name'], 'Welcome to {{organization_name}}!\n\nYour account has been set up successfully.\n\n{{additional_info}}', ARRAY['organization_name', 'additional_info'], 'normal')
        ON CONFLICT (template_code) DO NOTHING;
    END IF;
END $$;

-- ============================================
-- 12. SMTP SETTINGS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'settings') THEN
        INSERT INTO settings (key, value, category, description) VALUES
            ('smtp.host', 'smtp.gmail.com', 'smtp', 'SMTP server host'),
            ('smtp.port', '587', 'smtp', 'SMTP server port'),
            ('smtp.secure', 'false', 'smtp', 'Use TLS/SSL'),
            ('smtp.user', 'info.yunite.ke@gmail.com', 'smtp', 'SMTP username'),
            ('smtp.password', '', 'smtp', 'SMTP password (encrypted)'),
            ('smtp.from_email', 'info.yunite.ke@gmail.com', 'smtp', 'Default from email'),
            ('smtp.from_name', 'YUNITE CBO', 'smtp', 'Default from name'),
            ('smtp.reply_to', 'support@yunite.ke', 'smtp', 'Reply-to address'),
            ('notifications.enabled', 'true', 'notifications', 'Enable notifications'),
            ('notifications.email_enabled', 'true', 'notifications', 'Enable email notifications'),
            ('notifications.max_retries', '3', 'notifications', 'Max retry attempts'),
            ('notifications.retry_delay_minutes', '30', 'notifications', 'Delay between retries in minutes'),
            ('notifications.digest_enabled', 'false', 'notifications', 'Enable digest mode'),
            ('notifications.digest_time', '09:00', 'notifications', 'Daily digest time'),
            ('notifications.statement_retention_days', '365', 'notifications', 'Days to retain statements')
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- ============================================
-- 13. RLS POLICIES (skip if already exist)
-- ============================================
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Check if RLS is enabled
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications';
    
    IF policy_count = 0 THEN
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
        CREATE POLICY "Public read notifications" ON notifications FOR SELECT USING (true);
        CREATE POLICY "Public read templates" ON notification_templates FOR SELECT USING (true);
        CREATE POLICY "Public read schedules" ON notification_schedules FOR SELECT USING (true);
        CREATE POLICY "Public read preferences" ON notification_preferences FOR SELECT USING (true);
        CREATE POLICY "Public read delivery history" ON notification_delivery_history FOR SELECT USING (true);
        CREATE POLICY "Public read statements" ON notification_statements FOR SELECT USING (true);
        CREATE POLICY "Public read event logs" ON notification_event_logs FOR SELECT USING (true);
        CREATE POLICY "Public read email queue" ON email_queue FOR SELECT USING (true);
        
        CREATE POLICY "Public insert notifications" ON notifications FOR INSERT WITH CHECK (true);
        CREATE POLICY "Public insert event logs" ON notification_event_logs FOR INSERT WITH CHECK (true);
        CREATE POLICY "Public insert email queue" ON email_queue FOR INSERT WITH CHECK (true);
        CREATE POLICY "Public insert delivery history" ON notification_delivery_history FOR INSERT WITH CHECK (true);
        CREATE POLICY "Public insert preferences" ON notification_preferences FOR INSERT WITH CHECK (true);
        CREATE POLICY "Public insert statements" ON notification_statements FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- ============================================
-- 14. COMMENTS
-- ============================================
COMMENT ON TABLE notifications IS 'Core notification records - both internal and email';
COMMENT ON TABLE notification_templates IS 'Reusable templates with placeholder variables';
COMMENT ON TABLE notification_schedules IS 'Recurring scheduled notification patterns';
COMMENT ON TABLE email_queue IS 'SMTP email queue for asynchronous delivery';
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel preferences';
COMMENT ON TABLE notification_delivery_history IS 'Complete delivery audit trail';
COMMENT ON TABLE notification_statements IS 'Generated financial statement metadata';
COMMENT ON TABLE notification_event_logs IS 'Event-driven notification trigger log';
