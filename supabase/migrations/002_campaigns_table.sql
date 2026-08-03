-- YUNITE Enterprise Operating System
-- Migration 002: Contribution Campaigns Table
-- Adds proper CRUD support for contribution campaigns

-- ============================================
-- CONTRIBUTION CAMPAIGNS
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_name TEXT NOT NULL,
    description TEXT,
    target_amount DECIMAL(15, 2) DEFAULT 0,
    collected_amount DECIMAL(15, 2) DEFAULT 0,
    contribution_count INTEGER DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_start_date ON campaigns(start_date);

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access" ON campaigns FOR SELECT USING (true);

-- Public insert/update/delete
CREATE POLICY "Public insert" ON campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON campaigns FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON campaigns FOR DELETE USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Default Campaigns
-- ============================================
INSERT INTO campaigns (campaign_name, description, target_amount, start_date, is_active) VALUES
    ('Monthly Contributions', 'Regular monthly contributions from all members', 100000, CURRENT_DATE, true),
    ('Special Contributions', 'Special contribution drives for specific purposes', 50000, CURRENT_DATE, true),
    ('Development Fund', 'Contributions towards organizational development', 200000, CURRENT_DATE, true)
ON CONFLICT DO NOTHING;
