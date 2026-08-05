-- ===================================================================
-- CORRECTED DOCUMENT MANAGEMENT SYSTEM MIGRATION
-- This migration handles document tables idempotently
-- Run this AFTER migrations 006 and 007 if they failed
-- ===================================================================

DO $$
BEGIN
    -- ===================================================================
    -- PART 1: ENHANCED DOCUMENTS TABLE
    -- ===================================================================
    
    -- Add columns to documents table (only if they don't exist)
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_by UUID;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id UUID;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_file_name TEXT;

    -- Add indexes for enhanced queries (drop first to be safe)
    DROP INDEX IF EXISTS idx_documents_member_id;
    CREATE INDEX idx_documents_member_id ON documents(member_id);
    
    DROP INDEX IF EXISTS idx_documents_type;
    CREATE INDEX idx_documents_type ON documents(document_type);
    
    DROP INDEX IF EXISTS idx_documents_status;
    CREATE INDEX idx_documents_status ON documents(status);
    
    DROP INDEX IF EXISTS idx_documents_storage_bucket;
    CREATE INDEX idx_documents_storage_bucket ON documents(storage_bucket);
    
    DROP INDEX IF EXISTS idx_documents_archived;
    CREATE INDEX idx_documents_archived ON documents(is_archived);
    
    DROP INDEX IF EXISTS idx_documents_version;
    CREATE INDEX idx_documents_version ON documents(version);
    
    DROP INDEX IF EXISTS idx_documents_parent;
    CREATE INDEX idx_documents_parent ON documents(parent_document_id);

    RAISE NOTICE 'Part 1 complete: Enhanced documents table';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Part 1 error (may be expected): %', SQLERRM;
END $$;

DO $$
BEGIN
    -- ===================================================================
    -- PART 2: DOCUMENT CATEGORIES TABLE
    -- ===================================================================
    
    CREATE TABLE IF NOT EXISTS document_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        module TEXT NOT NULL,
        is_required BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        allowed_mime_types TEXT[] DEFAULT ARRAY['image/*', 'application/pdf']::TEXT[],
        max_file_size_mb INTEGER DEFAULT 10,
        retention_days INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed default document categories
    INSERT INTO document_categories (code, name, description, module, is_required, sort_order) VALUES
        ('member_national_id', 'National Identification', 'National ID card', 'members', TRUE, 1),
        ('member_passport_photo', 'Passport Photograph', 'Recent passport-size photograph', 'members', TRUE, 2),
        ('member_kra_pin', 'KRA PIN Certificate', 'KRA PIN certificate', 'members', TRUE, 3),
        ('member_proof_residence', 'Proof of Residence', 'Utility bill or official document', 'members', TRUE, 4),
        ('member_application_form', 'Membership Application Form', 'Signed membership application', 'members', TRUE, 5),
        ('member_agreement', 'Member Agreement', 'Signed member agreement', 'members', TRUE, 6)
    ON CONFLICT (code) DO NOTHING;

    RAISE NOTICE 'Part 2 complete: Document categories';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Part 2 error (may be expected): %', SQLERRM;
END $$;

DO $$
BEGIN
    -- ===================================================================
    -- PART 3: CONFIGURATION CATEGORIES TABLE
    -- ===================================================================
    
    CREATE TABLE IF NOT EXISTS configuration_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT DEFAULT '#3B82F6',
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        parent_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO configuration_categories (code, name, description, icon, color, sort_order) VALUES
        ('organization', 'Organization', 'Organization profile', 'building', '#10B981', 1),
        ('financial', 'Financial', 'Financial settings', 'coins', '#3B82F6', 2),
        ('loan', 'Loans', 'Loan products', 'banknotes', '#F59E0B', 3),
        ('welfare', 'Welfare', 'Welfare schemes', 'heart', '#8B5CF6', 4)
    ON CONFLICT (code) DO NOTHING;

    RAISE NOTICE 'Part 3 complete: Configuration categories';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Part 3 error (may be expected): %', SQLERRM;
END $$;

DO $$
BEGIN
    -- ===================================================================
    -- PART 4: MEMBER COMPLIANCE TABLE
    -- ===================================================================
    
    CREATE TABLE IF NOT EXISTS member_compliance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID NOT NULL,
        document_category_id UUID,
        document_category_code TEXT NOT NULL,
        document_id UUID,
        status TEXT DEFAULT 'pending',
        submitted_at TIMESTAMPTZ,
        reviewed_by UUID,
        reviewed_at TIMESTAMPTZ,
        review_notes TEXT,
        expiry_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add indexes
    DROP INDEX IF EXISTS idx_member_compliance_member;
    CREATE INDEX idx_member_compliance_member ON member_compliance(member_id);
    
    DROP INDEX IF EXISTS idx_member_compliance_status;
    CREATE INDEX idx_member_compliance_status ON member_compliance(status);

    RAISE NOTICE 'Part 4 complete: Member compliance';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Part 4 error (may be expected): %', SQLERRM;
END $$;

DO $$
BEGIN
    -- ===================================================================
    -- PART 5: FILE UPLOADS TABLE
    -- ===================================================================
    
    CREATE TABLE IF NOT EXISTS file_uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        storage_bucket TEXT DEFAULT 'documents',
        file_size BIGINT NOT NULL,
        mime_type TEXT NOT NULL,
        module TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id UUID NOT NULL,
        uploaded_by UUID,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add indexes
    DROP INDEX IF EXISTS idx_file_uploads_entity;
    CREATE INDEX idx_file_uploads_entity ON file_uploads(module, entity_type, entity_id);
    
    DROP INDEX IF EXISTS idx_file_uploads_status;
    CREATE INDEX idx_file_uploads_status ON file_uploads(status);

    RAISE NOTICE 'Part 5 complete: File uploads';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Part 5 error (may be expected): %', SQLERRM;
END $$;

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
