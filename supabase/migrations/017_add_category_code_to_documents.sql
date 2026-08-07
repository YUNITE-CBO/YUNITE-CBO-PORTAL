-- ===================================================================
-- Add missing columns to documents table for enhanced document service
-- ===================================================================

-- First, update the status CHECK constraint to support enhanced document statuses
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
    CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected', 'verified', 'expired', 'archived', 'deleted'));

-- Core classification columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_ref TEXT UNIQUE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_code TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Verification columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Expiration tracking
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- Audit columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Access control column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'authenticated' 
    CHECK (visibility IN ('public', 'authenticated', 'admin', 'owner'));

-- Additional storage columns (ensure these exist)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_file_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Versioning columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id);

-- Archive columns
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);

-- Generate document references for existing documents
UPDATE documents 
SET document_ref = 'DOC-' || LEFT(id::text, 8) 
WHERE document_ref IS NULL;

-- Update category_code from document_type for existing records
UPDATE documents 
SET category_code = document_type 
WHERE category_code IS NULL AND document_type IS NOT NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_documents_category_code ON documents(category_code);
CREATE INDEX IF NOT EXISTS idx_documents_module ON documents(module);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_ref ON documents(document_ref);
CREATE INDEX IF NOT EXISTS idx_documents_verified ON documents(is_verified);
CREATE INDEX IF NOT EXISTS idx_documents_expired ON documents(is_expired);
CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
