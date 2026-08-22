-- ===================================================================
-- 045: PERMANENT MEMBER DELETION ENGINE
--
-- A Super-Admin-only, atomic permanent deletion capability. One member
-- can have records spread across members, accounts, transactions, loans,
-- loan_interest_receipts, fines, documents, compliance, meetings,
-- notifications (+ email queue + delivery history + statements +
-- preferences), media assets, file uploads, registration submissions,
-- generated documents, and AI verification results.
--
-- This migration provides:
--   1. `permanent_member_deletions` — the MINIMAL administrative audit
--      record (who/when/which member id + number). It deliberately stores
--      NO financial history, NO personal payload — only the deletion fact.
--   2. `permanently_delete_member(p_member_id, p_admin_id)` — a single
--      Postgres function that performs the ENTIRE dependency-ordered
--      deletion. A function executes inside ONE database transaction:
--      any failure raises an exception and EVERYTHING rolls back, so the
--      system can never be left with half-deleted financial data.
--
-- Dependency ordering (mapped from migrations 001-044, NOT guessed):
--   member_compliance.document_id → documents        (delete compliance first)
--   email_queue.notification_id → notifications      (delete queue first)
--   notification_delivery_history.notification_id → notifications
--   loan_interest_receipts.loan_id → loans           (delete receipts first)
--   transactions.account_id → accounts, transactions.member_id → members
--   loans/fines/documents/compliance_records/meeting_attendance .member_id
--     → members (NO cascade)                          (delete before member)
--   meetings.chairperson/secretary → members         (SET NULL first)
--   accounts/member_compliance/member_approval_workflow/
--   member_status_history/member_committees/member_projects/
--   member_meetings/loan_interest_receipts(member) → members ON DELETE CASCADE
--   generated_documents/ai_verification_results → members ON DELETE SET NULL
--   notification_preferences/notification_statements (012 columns member_id,
--     005 columns owner_type+owner_id / recipient_type+recipient_id — no FK)
--   member_registration_submissions.registered_member_id/existing_member_id
--     (no FK — unlink, intake record preserved)
--   media_assets / file_uploads (no FK — delete by owner_type/entity_type)
--   member_financial_obligations / unity_fund_actual_receipts (VIEWS — auto)
--   audit_logs / notification_event_logs (append-only operational audit — KEPT)
--
-- DELIBERATE EXCEPTION: migration 001 documents "NEVER delete transactions -
-- use reversals" for DAY-TO-DAY operations. This function is the single,
-- audited, Super-Admin-only exception: a permanent member deletion removes
-- the member's ledger rows so no orphaned financial data can remain.
-- Organization totals are computed LIVE (SUM over the ledger / views), so
-- they are automatically correct once the member's rows are gone.
--
-- Idempotent: safe to re-run.
-- ===================================================================

-- ===================================================================
-- 1. MINIMAL ADMINISTRATIVE AUDIT TABLE
--    One row per permanent deletion. Stores the FACT of the deletion
--    (member id + member number + authorizing admin + timestamp + the
--    per-table deleted-row counts for the completion report). It must
--    NEVER recreate the deleted member's financial or personal history.
-- ===================================================================
CREATE TABLE IF NOT EXISTS permanent_member_deletions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL,             -- the deleted member's id (no FK: member is gone)
    member_number TEXT NOT NULL,         -- identifier for traceability
    deleted_by UUID NOT NULL,            -- authorizing super admin (users.id)
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    deleted_counts JSONB NOT NULL DEFAULT '{}',  -- {table: rowCount} summary only
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_pmd_member_id ON permanent_member_deletions(member_id);
CREATE INDEX IF NOT EXISTS idx_pmd_deleted_at ON permanent_member_deletions(deleted_at DESC);

-- ===================================================================
-- 2. HARDEN FOREIGN KEYS THAT WOULD BLOCK A PERMANENT DELETE
--    Some historical FKs to members were created WITHOUT a delete action
--    (default NO ACTION) on columns that are NOT NULL (transactions,
--    loans, fines, compliance_records, meeting_attendance). Because we
--    delete those rows BEFORE the member, the NO ACTION default never
--    fires — but documents.member_id is NULLABLE in later migrations and
--    member_compliance.document_id references documents: ordering already
--    handles both. No constraint changes are required; this section only
--    documents the verified ordering invariants:
--      * member_compliance (has document_id → documents) deleted BEFORE documents
--      * email_queue + notification_delivery_history BEFORE notifications
--      * loan_interest_receipts BEFORE loans
--      * transactions BEFORE accounts BEFORE members
-- ===================================================================

-- ===================================================================
-- 3. THE ATOMIC DELETION FUNCTION
-- ===================================================================
-- Drop first: changing the return type of an existing function errors
-- (42P13), and re-runs must be safe.
DROP FUNCTION IF EXISTS permanently_delete_member(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION permanently_delete_member(
    p_member_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_counts JSONB := '{}'::JSONB;
    v_n INT;
    v_has_col BOOLEAN;
    v_table TEXT;
    v_notif_ids UUID[];
    v_queue_ids UUID[];
    v_member_email TEXT;
    v_doc_paths TEXT[];
    v_media_objects JSONB := '[]'::JSONB;
    v_member_pred TEXT;
BEGIN
    -- ---------------------------------------------------------------
    -- 0. Resolve + lock the member. Not found → exception → rollback.
    -- ---------------------------------------------------------------
    SELECT * INTO v_member FROM members WHERE id = p_member_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member % not found', p_member_id;
    END IF;
    v_member_email := v_member.email;

    -- Helper pattern used throughout: every delete records its row count
    -- into v_counts so the completion report reflects reality.

    -- ---------------------------------------------------------------
    -- 1. member_compliance (FK document_id → documents: delete FIRST)
    -- ---------------------------------------------------------------
    IF to_regclass('public.member_compliance') IS NOT NULL THEN
        DELETE FROM member_compliance WHERE member_id = p_member_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('member_compliance', v_n);
    END IF;

    -- ---------------------------------------------------------------
    -- 2. Notifications + their delivery chain (queue + history first)
    --    notifications.member_id exists (004); 005 adds recipient_type/
    --    recipient_id. Guard both shapes.
    -- ---------------------------------------------------------------
    -- The notifications table can exist in two shapes: migration 004
    -- (member_id, title/message) or migration 005 (recipient_type/
    -- recipient_id). Guard each column independently and build the WHERE
    -- clause dynamically so either shape works.
    v_member_pred := NULL;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'member_id'
    ) INTO v_has_col;
    IF v_has_col THEN
        v_member_pred := 'member_id = $1';
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'recipient_id'
    ) INTO v_has_col;
    IF v_has_col THEN
        v_member_pred := CASE WHEN v_member_pred IS NULL
            THEN '(recipient_type = ''member'' AND recipient_id = $1)'
            ELSE v_member_pred || ' OR (recipient_type = ''member'' AND recipient_id = $1)'
        END;
    END IF;

    IF v_member_pred IS NOT NULL THEN
        EXECUTE format('SELECT ARRAY(SELECT id FROM notifications WHERE %s)', v_member_pred)
        INTO v_notif_ids USING p_member_id;
    ELSE
        v_notif_ids := ARRAY[]::UUID[];
    END IF;

    -- Collect the queue rows to remove: linked to member notifications OR
    -- addressed directly to the member's email (e.g. the applicant
    -- confirmation, which has notification_id NULL).
    v_queue_ids := ARRAY[]::UUID[];
    IF to_regclass('public.email_queue') IS NOT NULL THEN
        SELECT ARRAY(
            SELECT id FROM email_queue
            WHERE (v_notif_ids IS NOT NULL AND array_length(v_notif_ids, 1) > 0
                   AND notification_id = ANY(v_notif_ids))
               OR (v_member_email IS NOT NULL AND to_email = v_member_email)
        ) INTO v_queue_ids;
    END IF;

    -- Delivery history references BOTH notifications(notification_id) AND
    -- email_queue(email_queue_id) — clear it FIRST by either link before
    -- deleting the rows it points at (fixes
    -- notification_delivery_history_email_queue_id_fkey violations).
    IF to_regclass('public.notification_delivery_history') IS NOT NULL THEN
        DELETE FROM notification_delivery_history
        WHERE (v_notif_ids IS NOT NULL AND array_length(v_notif_ids, 1) > 0
               AND notification_id = ANY(v_notif_ids))
           OR (v_queue_ids IS NOT NULL AND array_length(v_queue_ids, 1) > 0
               AND email_queue_id = ANY(v_queue_ids));
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('notification_delivery_history', v_n);
    END IF;

    IF v_queue_ids IS NOT NULL AND array_length(v_queue_ids, 1) > 0 THEN
        DELETE FROM email_queue WHERE id = ANY(v_queue_ids);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('email_queue', v_n);
    END IF;

    IF v_member_pred IS NOT NULL THEN
        EXECUTE format('DELETE FROM notifications WHERE %s', v_member_pred)
        USING p_member_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('notifications', v_n);
    END IF;

    -- ---------------------------------------------------------------
    -- 3. Notification statements (012: member_id; 005: recipient_*)
    -- ---------------------------------------------------------------
    IF to_regclass('public.notification_statements') IS NOT NULL THEN
        -- 012 shape: member_id; 005 shape: recipient_type/recipient_id.
        v_member_pred := NULL;
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'notification_statements' AND column_name = 'member_id'
        ) INTO v_has_col;
        IF v_has_col THEN v_member_pred := 'member_id = $1'; END IF;
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'notification_statements' AND column_name = 'recipient_id'
        ) INTO v_has_col;
        IF v_has_col THEN
            v_member_pred := CASE WHEN v_member_pred IS NULL
                THEN '(recipient_type = ''member'' AND recipient_id = $1)'
                ELSE v_member_pred || ' OR (recipient_type = ''member'' AND recipient_id = $1)'
            END;
        END IF;
        IF v_member_pred IS NOT NULL THEN
            EXECUTE format('DELETE FROM notification_statements WHERE %s', v_member_pred)
            USING p_member_id;
            GET DIAGNOSTICS v_n = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object('notification_statements', v_n);
        END IF;
    END IF;

    -- ---------------------------------------------------------------
    -- 4. Notification preferences (012: member_id; 005: owner_*)
    -- ---------------------------------------------------------------
    IF to_regclass('public.notification_preferences') IS NOT NULL THEN
        -- 012 shape: member_id; 005 shape: owner_type/owner_id.
        v_member_pred := NULL;
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'notification_preferences' AND column_name = 'member_id'
        ) INTO v_has_col;
        IF v_has_col THEN v_member_pred := 'member_id = $1'; END IF;
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'notification_preferences' AND column_name = 'owner_id'
        ) INTO v_has_col;
        IF v_has_col THEN
            v_member_pred := CASE WHEN v_member_pred IS NULL
                THEN '(owner_type = ''member'' AND owner_id = $1)'
                ELSE v_member_pred || ' OR (owner_type = ''member'' AND owner_id = $1)'
            END;
        END IF;
        IF v_member_pred IS NOT NULL THEN
            EXECUTE format('DELETE FROM notification_preferences WHERE %s', v_member_pred)
            USING p_member_id;
            GET DIAGNOSTICS v_n = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object('notification_preferences', v_n);
        END IF;
    END IF;

    -- ---------------------------------------------------------------
    -- 5. Approval workflow + status history + enhanced profile tables
    --    (all ON DELETE CASCADE from members, deleted explicitly here for
    --    deterministic counts in the completion report)
    -- ---------------------------------------------------------------
    FOREACH v_table IN ARRAY ARRAY[
        'member_approval_workflow', 'member_status_history',
        'member_committees', 'member_projects', 'member_meetings'
    ] LOOP
        IF to_regclass('public.' || v_table) IS NOT NULL THEN
            EXECUTE format('DELETE FROM %I WHERE member_id = $1', v_table)
            USING p_member_id;
            GET DIAGNOSTICS v_n = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object(v_table, v_n);
        END IF;
    END LOOP;

    -- ---------------------------------------------------------------
    -- 6. Loan interest receipts BEFORE loans (FK loan_id → loans)
    -- ---------------------------------------------------------------
    IF to_regclass('public.loan_interest_receipts') IS NOT NULL THEN
        DELETE FROM loan_interest_receipts WHERE member_id = p_member_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('loan_interest_receipts', v_n);
    END IF;

    -- ---------------------------------------------------------------
    -- 7. Core financial records (member_id → members, NO cascade)
    -- ---------------------------------------------------------------
    DELETE FROM transactions WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('transactions', v_n);

    DELETE FROM loans WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('loans', v_n);

    DELETE FROM fines WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fines', v_n);

    DELETE FROM compliance_records WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('compliance_records', v_n);

    -- ---------------------------------------------------------------
    -- 8. Documents (collect storage paths for post-commit cleanup)
    -- ---------------------------------------------------------------
    SELECT ARRAY(
        SELECT file_path FROM documents
        WHERE member_id = p_member_id AND file_path IS NOT NULL
    ) INTO v_doc_paths;
    DELETE FROM documents WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('documents', v_n);

    -- ---------------------------------------------------------------
    -- 9. File uploads (no FK; entity linkage)
    -- ---------------------------------------------------------------
    IF to_regclass('public.file_uploads') IS NOT NULL THEN
        DELETE FROM file_uploads
        WHERE entity_type = 'member' AND entity_id = p_member_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('file_uploads', v_n);
    END IF;

    -- ---------------------------------------------------------------
    -- 10. Meetings: attendance rows deleted; chair/secretary unlinked
    -- ---------------------------------------------------------------
    IF to_regclass('public.meeting_attendance') IS NOT NULL THEN
        DELETE FROM meeting_attendance WHERE member_id = p_member_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('meeting_attendance', v_n);
    END IF;
    IF to_regclass('public.meetings') IS NOT NULL THEN
        UPDATE meetings SET chairperson = NULL WHERE chairperson = p_member_id;
        UPDATE meetings SET secretary = NULL WHERE secretary = p_member_id;
    END IF;

    -- ---------------------------------------------------------------
    -- 11. Registration submissions: UNLINK (intake record preserved,
    --     but no dangling reference to the deleted member)
    -- ---------------------------------------------------------------
    IF to_regclass('public.member_registration_submissions') IS NOT NULL THEN
        UPDATE member_registration_submissions SET registered_member_id = NULL
        WHERE registered_member_id = p_member_id;
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'member_registration_submissions' AND column_name = 'existing_member_id'
        ) INTO v_has_col;
        IF v_has_col THEN
            UPDATE member_registration_submissions SET existing_member_id = NULL
            WHERE existing_member_id = p_member_id;
        END IF;
    END IF;

    -- ---------------------------------------------------------------
    -- 12. Media assets (no FK; collect storage paths for cleanup)
    -- ---------------------------------------------------------------
    IF to_regclass('public.media_assets') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'bucket', storage_bucket, 'path', storage_path
        )), '[]'::JSONB)
        FROM media_assets
        WHERE owner_type = 'member' AND owner_id = p_member_id::TEXT
          AND storage_path IS NOT NULL
        INTO v_media_objects;
        DELETE FROM media_assets
        WHERE owner_type = 'member' AND owner_id = p_member_id::TEXT;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('media_assets', v_n);
    END IF;

    -- ---------------------------------------------------------------
    -- 13. Accounts (CASCADE would handle; explicit for the report)
    -- ---------------------------------------------------------------
    DELETE FROM accounts WHERE member_id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('accounts', v_n);

    -- ---------------------------------------------------------------
    -- 14. THE MEMBER (final). Remaining cascades/SET NULLs fire here:
    --     generated_documents.member_id → NULL,
    --     ai_verification_results.member_id → NULL.
    -- ---------------------------------------------------------------
    DELETE FROM members WHERE id = p_member_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('members', v_n);

    -- ---------------------------------------------------------------
    -- 15. Minimal administrative audit record (NO financial history).
    -- ---------------------------------------------------------------
    INSERT INTO permanent_member_deletions (
        member_id, member_number, deleted_by, reason, deleted_counts, ip_address, user_agent
    ) VALUES (
        p_member_id, v_member.member_number, p_admin_id, p_reason, v_counts, p_ip_address, p_user_agent
    );

    -- ---------------------------------------------------------------
    -- 16. Completion report. If anything above failed, Postgres has
    --     already aborted the statement and rolled back EVERYTHING.
    -- ---------------------------------------------------------------
    RETURN jsonb_build_object(
        'member_id', p_member_id,
        'member_number', v_member.member_number,
        'member_name', v_member.first_name || ' ' || v_member.last_name,
        'deleted_counts', v_counts,
        'document_storage_paths', COALESCE(to_jsonb(v_doc_paths), '[]'::JSONB),
        'media_storage_objects', v_media_objects,
        'deleted_at', NOW()
    );
END;
$$;

-- Only the service role (server-side, Super-Admin-gated route) may execute.
REVOKE ALL ON FUNCTION permanently_delete_member(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION permanently_delete_member(uuid, uuid, text, text, text) TO service_role;
