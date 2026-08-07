-- ===================================================================
-- Add document soft-deletion columns to documents table
-- These columns are used by the document service for soft-delete functionality
-- ===================================================================

-- Add deletion tracking columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Add index for efficient queries on deleted documents
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_by ON documents(deleted_by) WHERE deleted_by IS NOT NULL;

-- Update the status constraint to include 'deleted' status
-- First, drop the existing constraint if it exists
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;

-- Add the new constraint with 'deleted' status
ALTER TABLE documents ADD CONSTRAINT documents_status_check 
    CHECK (status IN ('pending', 'verified', 'expired', 'deleted'));
