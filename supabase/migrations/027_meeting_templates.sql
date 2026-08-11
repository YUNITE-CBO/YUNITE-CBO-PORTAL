-- ===================================================================
-- 027: Meeting notification templates
--
-- Phase 5: templates for meeting create/cancel broadcasts + the reminder
-- cadence. The reminder templates carry {{meeting_title}}, {{meeting_date}},
-- {{venue}}, {{agenda}} variables resolved by the runner's meetings step.
-- ===================================================================

INSERT INTO notification_templates (template_code, name, description, channels, subject_template, subject_variables, body_template, body_variables, priority, is_active)
VALUES
  ('meeting.created', 'Meeting Created', 'Broadcast to active members when a meeting is scheduled.', ARRAY['in_app', 'email'], '{{organization_name}} — Meeting: {{meeting_title}}', ARRAY['organization_name', 'meeting_title']::TEXT[], 'Dear {{member_name}},\n\nA meeting has been scheduled:\n\nTitle: {{meeting_title}}\nDate: {{meeting_date}}\nVenue: {{venue}}\nAgenda: {{agenda}}\n\nPlease make arrangements to attend.', ARRAY['member_name', 'meeting_title', 'meeting_date', 'venue', 'agenda']::TEXT[], 'normal', true),
  ('meeting.cancelled', 'Meeting Cancelled', 'Broadcast to active members when a meeting is cancelled.', ARRAY['in_app', 'email'], '{{organization_name}} — Meeting Cancelled: {{meeting_title}}', ARRAY['organization_name', 'meeting_title']::TEXT[], 'Dear {{member_name}},\n\nPlease note that the meeting "{{meeting_title}}" scheduled for {{meeting_date}} has been cancelled.', ARRAY['member_name', 'meeting_title', 'meeting_date']::TEXT[], 'high', true),
  ('meeting.reminder', 'Meeting Reminder', 'Configurable reminder before a meeting starts.', ARRAY['in_app', 'email'], '{{organization_name}} — Reminder: {{meeting_title}} on {{meeting_date}}', ARRAY['organization_name', 'meeting_title', 'meeting_date']::TEXT[], 'Dear {{member_name}},\n\nThis is a reminder that the meeting "{{meeting_title}}" is scheduled for {{meeting_date}} at {{venue}}.\n\nAgenda: {{agenda}}', ARRAY['member_name', 'meeting_title', 'meeting_date', 'venue', 'agenda']::TEXT[], 'normal', true)
ON CONFLICT (template_code) DO NOTHING;

-- Ensure a 'meetings' notification category exists (used as category_code
-- by the meetings service broadcasts).
INSERT INTO notification_categories (code, name, description, icon, color, sort_order)
VALUES ('meetings', 'Meetings', 'Meeting scheduling, reminders, and attendance.', 'calendar', '#2563EB', 7)
ON CONFLICT (code) DO NOTHING;
