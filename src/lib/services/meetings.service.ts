/**
 * Meetings Service
 *
 * CRUD for the `meetings` table plus event-driven notifications:
 *   - On create: broadcast a meeting.created notification to all active members
 *     (in-app + email per the workflow.channels.* settings).
 *   - On update/cancel: notify active members who were already notified.
 *
 * Reminders (configurable offsets: 7d/3d/1d/2h before start) are NOT handled
 * here — they are evaluated by the automation runner's meetings step, which
 * runs on the cron tick. This keeps the synchronous request path fast.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notificationService } from './notifications/notification.service';
import { settingsService } from './settings.service';
import { v4 as uuidv4 } from 'uuid';

export interface MeetingInput {
  meeting_title: string;
  meeting_type?: 'general' | 'agm' | 'egm' | 'committee' | 'board';
  scheduled_date: string; // ISO
  start_time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  agenda?: string | null;
  chairperson?: string | null;
  secretary?: string | null;
  created_by?: string | null;
  status?: string;
}

export interface Meeting extends MeetingInput {
  id: string;
  meeting_number: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * The meetings.start_time/end_time columns are TIMESTAMPTZ (migration 004),
 * but clients may send a plain "HH:MM" from <input type="time">, which
 * Postgres rejects ("invalid input syntax for type timestamp with time
 * zone") and the create/update fails with a 500. Normalize here: full
 * date/datetime strings pass through; bare "HH:MM[:SS]" values are anchored
 * on the meeting's scheduled_date; empty/invalid values become null.
 */
export function normalizeMeetingTime(scheduledDate: string | undefined, time?: string | null): string | null {
  if (!time) return null;
  const t = String(time).trim();
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const datePart = (scheduledDate || '').slice(0, 10);
  const d = new Date(`${datePart}T${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

class MeetingsService {
  async create(input: MeetingInput): Promise<Meeting> {
    const supabase = await createServiceClient();
    const meeting_number = `MTG-${Date.now().toString().slice(-8)}-${uuidv4().slice(0, 4).toUpperCase()}`;

    const { data: meeting, error } = await supabase
      .from('meetings')
      .insert({
        ...input,
        start_time: normalizeMeetingTime(input.scheduled_date, input.start_time),
        end_time: normalizeMeetingTime(input.scheduled_date, input.end_time),
        meeting_number,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create meeting: ${error.message}`);

    // Broadcast to active members (gated by workflow.meetings.notifications)
    await this.broadcastMeeting(meeting as Meeting, 'created').catch((e) =>
      console.warn('[meetings] broadcast created failed:', e?.message)
    );

    return meeting as Meeting;
  }

  async update(id: string, patch: Partial<MeetingInput>): Promise<Meeting> {
    const supabase = await createServiceClient();

    let anchor = patch.scheduled_date;
    if ((patch.start_time !== undefined || patch.end_time !== undefined) && !anchor) {
      const existing = await this.get(id);
      anchor = existing?.scheduled_date;
    }
    const normalized: Partial<MeetingInput> = { ...patch };
    if (patch.start_time !== undefined) {
      normalized.start_time = normalizeMeetingTime(anchor, patch.start_time);
    }
    if (patch.end_time !== undefined) {
      normalized.end_time = normalizeMeetingTime(anchor, patch.end_time);
    }

    const { data: meeting, error } = await supabase
      .from('meetings')
      .update({ ...normalized, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update meeting: ${error.message}`);

    const cancelled = patch.status === 'cancelled';
    await this.broadcastMeeting(meeting as Meeting, cancelled ? 'cancelled' : 'updated').catch((e) =>
      console.warn('[meetings] broadcast update failed:', e?.message)
    );

    return meeting as Meeting;
  }

  async list(upcomingOnly = false): Promise<Meeting[]> {
    const supabase = await createServiceClient();
    let query = supabase
      .from('meetings')
      .select('*')
      .order('scheduled_date', { ascending: upcomingOnly });
    if (upcomingOnly) {
      query = query.gte('scheduled_date', new Date().toISOString()).eq('status', 'scheduled');
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list meetings: ${error.message}`);
    return (data || []) as Meeting[];
  }

  async get(id: string): Promise<Meeting | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as Meeting;
  }

  /**
   * Broadcast a meeting create/update/cancel notification to all active members.
   * Uses bulk_members recipient_type with the array of member emails.
   */
  private async broadcastMeeting(meeting: Meeting, action: 'created' | 'updated' | 'cancelled') {
    const notifyOn = await this.getBoolSetting('workflow.meetings.notifications', true);
    if (!notifyOn) return;

    const emailChannelOn = await this.getBoolSetting('workflow.channels.email', true);
    const orgName = (await settingsService.get('organization.name')) || 'YUNITE CBO';

    const supabase = await createServiceClient();
    const { data: members } = await supabase
      .from('members')
      .select('id, email, phone, first_name, last_name')
      .eq('status', 'active');

    const activeMembers = (members || []).filter((m: any) => m.email);
    if (activeMembers.length === 0) return;

    const dateStr = new Date(meeting.scheduled_date).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const templateCode = action === 'cancelled' ? 'meeting.cancelled' : 'meeting.created';

    for (const member of activeMembers) {
      const name = `${member.first_name} ${member.last_name}`;
      const result = await notificationService.send({
        template_code: templateCode,
        category_code: 'meetings',
        subject: action === 'cancelled'
          ? `${orgName} — Meeting Cancelled: ${meeting.meeting_title}`
          : `${orgName} — Meeting: ${meeting.meeting_title}`,
        body: action === 'cancelled'
          ? `Dear ${name},\n\nPlease note that the meeting "${meeting.meeting_title}" scheduled for ${dateStr}${meeting.venue ? ` at ${meeting.venue}` : ''} has been cancelled.`
          : `Dear ${name},\n\nA meeting has been scheduled:\n\nTitle: ${meeting.meeting_title}\nDate: ${dateStr}${meeting.venue ? `\nVenue: ${meeting.venue}` : ''}${meeting.agenda ? `\nAgenda: ${meeting.agenda}` : ''}\n\nPlease make arrangements to attend.`,
        recipient_type: 'member',
        recipient_id: member.id,
        recipient_email: emailChannelOn ? member.email : undefined,
        recipient_phone: member.phone || undefined,
        recipient_name: name,
        source_module: 'automation',
        source_entity_type: 'meeting',
        source_entity_id: meeting.id,
        source_action: `meeting.${action}`,
        idempotency_key: `meeting-${meeting.id}-${action}-${member.id}`,
        variables: {
          organization_name: orgName,
          meeting_title: meeting.meeting_title,
          meeting_date: dateStr,
          venue: meeting.venue || '',
          agenda: meeting.agenda || '',
        },
      } as any);
      void result;
    }
  }

  private async getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
    const v = await settingsService.get(key);
    if (v === null || v === undefined) return fallback;
    return v === 'true' || v === '1';
  }
}

export const meetingsService = new MeetingsService();
