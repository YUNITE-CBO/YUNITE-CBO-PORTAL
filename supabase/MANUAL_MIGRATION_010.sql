-- =============================================
-- MANUAL MIGRATION FOR SUPABASE
-- =============================================
-- Run this SQL in your Supabase SQL Editor to apply the migration
-- https://sprlwlxjhhmazxpflhnb.supabase.co/project/-/sql
-- =============================================

-- STEP 1: Add Membership Configuration Category
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) 
VALUES ('membership', 'Membership', 'Membership rules and requirements', 'users', '#8B5CF6', 15)
ON CONFLICT (code) DO NOTHING;

-- STEP 2: Add System Configuration Category
INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) 
VALUES ('system', 'System', 'System administration and database management', 'settings', '#DC2626', 16)
ON CONFLICT (code) DO NOTHING;

-- STEP 3: Add Membership Settings
DO $$
DECLARE
    membership_cat_id UUID;
BEGIN
    SELECT id INTO membership_cat_id FROM configuration_categories WHERE code = 'membership';
    
    IF membership_cat_id IS NOT NULL THEN
        -- Minimum Age
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('membership.minimum_age', '18', 'membership', membership_cat_id, 'number', 1, 'Minimum age for membership')
        ON CONFLICT (key) DO NOTHING;
        
        -- Maximum Members
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('membership.maximum_members', '500', 'membership', membership_cat_id, 'number', 2, 'Maximum members allowed')
        ON CONFLICT (key) DO NOTHING;
        
        -- Require Guarantor
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('membership.require_guarantor', 'true', 'membership', membership_cat_id, 'boolean', 3, 'Require guarantor for loans')
        ON CONFLICT (key) DO NOTHING;
        
        -- Grace Period
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('membership.grace_period_days', '30', 'membership', membership_cat_id, 'number', 4, 'Grace period in days')
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- STEP 4: Add System Settings
DO $$
DECLARE
    system_cat_id UUID;
BEGIN
    SELECT id INTO system_cat_id FROM configuration_categories WHERE code = 'system';
    
    IF system_cat_id IS NOT NULL THEN
        -- Database Reset Enabled
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('system.database_reset_enabled', 'true', 'system', system_cat_id, 'boolean', 1, 'Enable database reset')
        ON CONFLICT (key) DO NOTHING;
        
        -- Require Backup
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('system.require_backup_before_reset', 'true', 'system', system_cat_id, 'boolean', 2, 'Require backup before reset')
        ON CONFLICT (key) DO NOTHING;
        
        -- System Version
        INSERT INTO settings (key, value, category, config_category_id, data_type, display_order, help_text)
        VALUES ('system.version', '1.3.0', 'system', system_cat_id, 'string', 3, 'System version')
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- STEP 5: Verify
SELECT 
    cc.code, 
    cc.name, 
    COUNT(s.id) as settings_count
FROM configuration_categories cc
LEFT JOIN settings s ON s.config_category_id = cc.id
WHERE cc.code IN ('membership', 'system')
GROUP BY cc.code, cc.name;
