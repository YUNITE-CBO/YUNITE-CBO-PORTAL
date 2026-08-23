-- ===================================================================
-- 046: Support Ticket System
--
-- Closes API gap #5 (member-lookup-frontend/API_GAPS.md): members can
-- now raise support requests in-app from the member portal instead of
-- only by contacting the office directly.
--
--   * support_tickets table — one row per member request
--     (member_id FK is ON DELETE CASCADE so the permanent member
--      deletion engine, migration 045, keeps working: the RPC's final
--      DELETE FROM members cascades ticket rows automatically).
--   * 'support' notification category + 3 templates:
--       support.ticket.received      — confirmation to the member
--       admin.support_ticket_received — alert to admins
--       support.ticket.updated        — member notified on status change
--
-- Idempotent: safe to re-run.
-- ===================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_reference TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('account','savings','shares','contributions','welfare','loans','fines','documents','statement','other')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  source TEXT NOT NULL DEFAULT 'member_portal',
  admin_response TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_member ON support_tickets(member_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION support_tickets_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION support_tickets_touch_updated_at();

-- Notification category
INSERT INTO notification_categories (code, name, description, icon, color, sort_order)
VALUES ('support', 'Support', 'Member support requests and ticket updates', 'life-buoy', '#0891B2', 60)
ON CONFLICT (code) DO NOTHING;

-- Templates
INSERT INTO notification_templates (template_code, name, description, category_id, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  (
    'support.ticket.received',
    'Support Ticket Received (Member)',
    'Confirmation sent to a member immediately after they submit a support request. Includes the ticket reference for follow-up.',
    (SELECT id FROM notification_categories WHERE code = 'support'),
    ARRAY['in_app', 'email']::TEXT[],
    'We have received your request — {{ticket_reference}}',
    ARRAY['ticket_reference']::TEXT[],
    'Dear {{member_name}},

Thank you for contacting {{organization_name}}. Your support request has been received and our team will respond as soon as possible.

Ticket Reference: {{ticket_reference}}
Subject: {{subject}}
Category: {{category}}

Please quote your ticket reference and member number ({{member_number}}) in any follow-up.

— {{organization_name}}',
    ARRAY['member_name', 'organization_name', 'ticket_reference', 'subject', 'category', 'member_number']::TEXT[],
    'normal',
    TRUE
  ),
  (
    'admin.support_ticket_received',
    'Support Ticket Received (Admin Alert)',
    'Alert sent to administrators when a member submits a new support request.',
    (SELECT id FROM notification_categories WHERE code = 'support'),
    ARRAY['in_app', 'email']::TEXT[],
    'New support request {{ticket_reference}} — {{subject}}',
    ARRAY['ticket_reference', 'subject']::TEXT[],
    'A member has submitted a new support request.

Ticket Reference: {{ticket_reference}}
Member: {{member_name}} ({{member_number}})
Category: {{category}}
Subject: {{subject}}

Message:
{{message}}

Open the Support Tickets page in the admin dashboard to respond.',
    ARRAY['ticket_reference', 'member_name', 'member_number', 'category', 'subject', 'message']::TEXT[],
    'high',
    TRUE
  ),
  (
    'support.ticket.updated',
    'Support Ticket Updated (Member)',
    'Sent to a member when the status of their support ticket changes (e.g. in progress, resolved), including any response from the office.',
    (SELECT id FROM notification_categories WHERE code = 'support'),
    ARRAY['in_app', 'email']::TEXT[],
    'Update on your request {{ticket_reference}} — {{status_label}}',
    ARRAY['ticket_reference', 'status_label']::TEXT[],
    'Dear {{member_name}},

There is an update on your support request.

Ticket Reference: {{ticket_reference}}
Subject: {{subject}}
New Status: {{status_label}}

{{admin_response_block}}

— {{organization_name}}',
    ARRAY['member_name', 'organization_name', 'ticket_reference', 'subject', 'status_label', 'admin_response_block']::TEXT[],
    'normal',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;
