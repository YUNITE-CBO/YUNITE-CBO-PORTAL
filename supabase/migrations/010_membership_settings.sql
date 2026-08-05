-- Migration 010: Add Membership Configuration Category and Settings
-- Date: 2026-08-05
-- Purpose: Restore membership configuration functionality from v1.0.2

-- ===================================================================
-- PART 1: CREATE MEMBERSHIP CONFIGURATION CATEGORY
-- ===================================================================

INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) 
VALUES ('membership', 'Membership', 'Membership rules and requirements', 'users', '#8B5CF6', 15)
ON CONFLICT (code) DO NOTHING;

-- ===================================================================
-- PART 2: ADD MEMBERSHIP SETTINGS
-- ===================================================================

-- Get the category ID for membership
DO $$
DECLARE
    membership_cat_id UUID;
BEGIN
    SELECT id INTO membership_cat_id FROM configuration_categories WHERE code = 'membership';
    
    IF membership_cat_id IS NOT NULL THEN
        -- Minimum Age for Membership
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.minimum_age',
            '18',
            'membership',
            membership_cat_id,
            'number',
            1,
            'Minimum age required for membership (in years)'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Maximum Members
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.maximum_members',
            '500',
            'membership',
            membership_cat_id,
            'number',
            2,
            'Maximum number of members allowed in the organization'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Require Guarantor
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.require_guarantor',
            'true',
            'membership',
            membership_cat_id,
            'boolean',
            3,
            'Require a guarantor for loan applications'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Grace Period Days
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.grace_period_days',
            '30',
            'membership',
            membership_cat_id,
            'number',
            4,
            'Grace period for membership fees (in days)'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Allow Self-Registration
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.allow_self_registration',
            'false',
            'membership',
            membership_cat_id,
            'boolean',
            5,
            'Allow members to register themselves online'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Require Approval
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'membership.require_approval',
            'true',
            'membership',
            membership_cat_id,
            'boolean',
            6,
            'Require admin approval for new member applications'
        )
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- ===================================================================
-- PART 3: CREATE SYSTEM CONFIGURATION CATEGORY
-- ===================================================================

INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) 
VALUES ('system', 'System', 'System administration and database management', 'settings', '#DC2626', 16)
ON CONFLICT (code) DO NOTHING;

-- ===================================================================
-- PART 4: ADD SYSTEM SETTINGS (Placeholder for Database Reset UI)
-- ===================================================================

DO $$
DECLARE
    system_cat_id UUID;
BEGIN
    SELECT id INTO system_cat_id FROM configuration_categories WHERE code = 'system';
    
    IF system_cat_id IS NOT NULL THEN
        -- Database Reset Enabled
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.database_reset_enabled',
            'true',
            'system',
            system_cat_id,
            'boolean',
            1,
            'Enable database reset functionality for administrators'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Require Backup Before Reset
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.require_backup_before_reset',
            'true',
            'system',
            system_cat_id,
            'boolean',
            2,
            'Require backup confirmation before database reset'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Auto-Archive Before Reset
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.auto_archive_before_reset',
            'true',
            'system',
            system_cat_id,
            'boolean',
            3,
            'Automatically create archive before database reset'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- System Version
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.version',
            '1.0.0',
            'system',
            system_cat_id,
            'string',
            4,
            'Current YUNITE Enterprise OS version'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Maintenance Mode
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.maintenance_mode',
            'false',
            'system',
            system_cat_id,
            'boolean',
            5,
            'Enable maintenance mode to prevent user access'
        )
        ON CONFLICT (key) DO NOTHING;
        
        -- Session Timeout (minutes)
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES (
            'system.session_timeout_minutes',
            '60',
            'system',
            system_cat_id,
            'number',
            6,
            'Session timeout in minutes (0 = no timeout)'
        )
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- ===================================================================
-- PART 5: UPDATE DISPLAY_ORDER FOR ALL CATEGORIES
-- ===================================================================

-- Ensure sort_order values are correct
UPDATE configuration_categories SET sort_order = 1 WHERE code = 'organization';
UPDATE configuration_categories SET sort_order = 2 WHERE code = 'financial';
UPDATE configuration_categories SET sort_order = 3 WHERE code = 'loan';
UPDATE configuration_categories SET sort_order = 4 WHERE code = 'savings';
UPDATE configuration_categories SET sort_order = 5 WHERE code = 'welfare';
UPDATE configuration_categories SET sort_order = 6 WHERE code = 'contributions';
UPDATE configuration_categories SET sort_order = 7 WHERE code = 'notifications';
UPDATE configuration_categories SET sort_order = 8 WHERE code = 'smtp';
UPDATE configuration_categories SET sort_order = 9 WHERE code = 'security';
UPDATE configuration_categories SET sort_order = 10 WHERE code = 'integrations';
UPDATE configuration_categories SET sort_order = 11 WHERE code = 'compliance';
UPDATE configuration_categories SET sort_order = 12 WHERE code = 'branding';
UPDATE configuration_categories SET sort_order = 13 WHERE code = 'workflow';
UPDATE configuration_categories SET sort_order = 14 WHERE code = 'api';
UPDATE configuration_categories SET sort_order = 15 WHERE code = 'membership';
UPDATE configuration_categories SET sort_order = 16 WHERE code = 'system';

-- ===================================================================
-- VERIFICATION
-- ===================================================================

-- Verify membership settings were created
SELECT 
    'Membership Settings' as category,
    COUNT(*) as count
FROM settings 
WHERE config_category_id = (SELECT id FROM configuration_categories WHERE code = 'membership');

-- Verify system settings were created  
SELECT 
    'System Settings' as category,
    COUNT(*) as count
FROM settings 
WHERE config_category_id = (SELECT id FROM configuration_categories WHERE code = 'system');

-- List all configuration categories
SELECT code, name, sort_order, is_active FROM configuration_categories ORDER BY sort_order;
