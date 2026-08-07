-- ===================================================================
-- Make documents.member_id nullable to support enterprise document service
-- The documents table is used by multiple modules (not just members),
-- so member_id should not be a required field for all documents
-- ===================================================================

-- Make member_id nullable in documents table
ALTER TABLE documents ALTER COLUMN member_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN documents.member_id IS 'Optional member association. Used when document belongs to a specific member. Nullable for non-member documents (e.g., organization, loans, etc.)';

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
