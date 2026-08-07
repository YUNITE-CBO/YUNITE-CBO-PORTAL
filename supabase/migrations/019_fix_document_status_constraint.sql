-- ===================================================================
-- Fix documents.status CHECK constraint to allow all document statuses
-- The enterprise document service uses more statuses than the original schema
-- ===================================================================

-- Drop the old check constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_status_check;

-- Add new check constraint with all valid document statuses
ALTER TABLE documents ADD CONSTRAINT document_status_check 
    CHECK (status IN (
        'draft',
        'pending', 
        'under_review',
        'approved',
        'rejected',
        'verified',
        'expired',
        'archived',
        'deleted'
    ));

-- Also update the default value to 'pending' instead of 'draft'
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
