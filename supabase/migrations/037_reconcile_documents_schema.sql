-- ===================================================================
-- 037: Reconcile documents table schema
--
-- The Enterprise Document Service (src/lib/services/documents/) and the
-- compliance/manual-complete flow write to many columns that were
-- introduced by migrations 008 / 017 / 021 but were never reliably
-- applied on the live database. PostgREST then returns
-- "Could not find the column <name> in the schema cache" for any write
-- or select that references a missing column (e.g. verification_notes,
-- is_verified, verified_by, category_code, module, file_size, ...).
--
-- This migration re-applies EVERY column the application code reads or
-- writes, idempotently (ADD COLUMN IF NOT EXISTS), and reconciles the
-- two conflicting status CHECK constraints so that 'approved' /
-- 'rejected' / 'under_review' / 'archived' / 'draft' are all allowed
-- (migration 021 created a separate `documents_status_check` that only
-- permitted pending/verified/expired/deleted, which rejected the
-- 'approved'/'rejected' statuses written by the document service).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ===================================================================

-- ----------------------------------------------------------------------
-- PART 1: Ensure every column referenced by application code exists
-- ----------------------------------------------------------------------

-- Classification (module / entity / category) — written by uploads, read
-- by compliance auto-complete + compliance score trigger.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_ref TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_code TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'unknown';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Verification — written by verify()/approve()/reject() and manual_complete.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Expiration / reminders
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- Audit
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Storage
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_file_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Versioning
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES documents(id);

-- Archive
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);

-- Visibility / access
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'authenticated';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_roles TEXT[] DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Soft deletion (migration 021)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- ----------------------------------------------------------------------
-- PART 2: Reconcile the status CHECK constraint
--
-- Migration 019 created `document_status_check` (broad: draft, pending,
-- under_review, approved, rejected, verified, expired, archived, deleted).
-- Migration 021 created a SECOND, NARROWER `documents_status_check`
-- (only pending, verified, expired, deleted) — this REJECTS the
-- 'approved' / 'rejected' / 'under_review' statuses the document service
-- writes, silently failing verify/approve/reject/manual_complete.
-- Drop the narrow one and keep the broad one from 019. Recreate the broad
-- one idempotently in case neither was applied.
-- ----------------------------------------------------------------------
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_status_check;
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
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';

-- ----------------------------------------------------------------------
-- PART 3: Backfill derived columns for existing rows
-- ----------------------------------------------------------------------
UPDATE documents SET document_ref = 'DOC-' || LEFT(id::text, 8)
WHERE document_ref IS NULL;

UPDATE documents SET category_code = document_type
WHERE category_code IS NULL AND document_type IS NOT NULL;

UPDATE documents SET module = 'members'
WHERE module IS NULL AND member_id IS NOT NULL;

UPDATE documents SET entity_id = member_id
WHERE entity_id IS NULL AND member_id IS NOT NULL;

UPDATE documents SET entity_type = 'member'
WHERE entity_type IS NULL AND member_id IS NOT NULL;

-- Ensure the UNIQUE constraint on document_ref does not block future
-- inserts when the column pre-existed without a unique index. Add it
-- only if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'documents' AND indexname = 'documents_document_ref_key'
    ) THEN
        -- Best-effort unique index; ignore failure if duplicates exist.
        BEGIN
            CREATE UNIQUE INDEX documents_document_ref_key ON documents(document_ref);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped unique index on documents.document_ref (likely duplicates present): %', SQLERRM;
        END;
    END IF;
END $$;

-- ----------------------------------------------------------------------
-- PART 4: Indexes for common query patterns
-- ----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_category_code ON documents(category_code);
CREATE INDEX IF NOT EXISTS idx_documents_module ON documents(module);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_ref ON documents(document_ref);
CREATE INDEX IF NOT EXISTS idx_documents_verified ON documents(is_verified);
CREATE INDEX IF NOT EXISTS idx_documents_expired ON documents(is_expired);
CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================
