-- 029_generated_documents.sql
-- Traceability ledger for every bank-like document generated & exported by
-- the YUNITE document engine (statements, member lists, financial/loan/
-- transaction/contribution/fine/welfare reports, org summaries).
--
-- Every generated document is:
--   - assigned a unique, human-readable reference (doc_ref)
--   - bound to a SHA-256 authenticity hash (auth_hash) for verification
--   - attributed to the issuing user (generated_by)
--   - scoped to a report type + period + optional member
--   - optionally expiry-tracked
-- This is what makes every document marked & traceable/authenticatable
-- in the system, even after it leaves the portal.

CREATE TABLE IF NOT EXISTS generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_ref TEXT UNIQUE NOT NULL,
    auth_hash TEXT NOT NULL,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'html')),
    period_start DATE,
    period_end DATE,
    period_label TEXT,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    member_number TEXT,
    file_size_bytes BIGINT,
    generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    generated_by_name TEXT,
    generated_by_role TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revoke_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_doc_ref ON generated_documents(doc_ref);
CREATE INDEX IF NOT EXISTS idx_generated_documents_report_type ON generated_documents(report_type);
CREATE INDEX IF NOT EXISTS idx_generated_documents_generated_by ON generated_documents(generated_by);
CREATE INDEX IF NOT EXISTS idx_generated_documents_member_id ON generated_documents(member_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_generated_at ON generated_documents(generated_at);

-- Verification view: a public (non-secret) lookup of issued documents by ref.
-- Exposes only the fields needed to authenticate a printed/claimed document.
CREATE OR REPLACE VIEW generated_document_verifications AS
SELECT
    doc_ref,
    auth_hash,
    report_type,
    title,
    period_label,
    member_number,
    generated_by_name,
    generated_at,
    expires_at,
    revoked,
    revoked_at
FROM generated_documents;

COMMENT ON TABLE generated_documents IS
'Immutable audit ledger of every document generated & exported by the YUNITE document engine. Each row carries a doc_ref + auth_hash for traceability.';
