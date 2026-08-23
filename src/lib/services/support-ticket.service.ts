/**
 * Support Ticket Service
 *
 * Member support requests raised from the member portal (or by staff on a
 * member's behalf). One row per request in `support_tickets` (migration 046).
 *
 * Notifications:
 *   - On create: `support.ticket.received` to the member (in-app + email) and
 *     `admin.support_ticket_received` to every active admin (in-app + email).
 *   - On status change: `support.ticket.updated` to the member.
 * All notification sends are best-effort — a template missing on a
 * not-yet-migrated DB must never fail the ticket write.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notificationService } from './notifications/notification.service';
import { settingsService } from './settings.service';
import { ORG_IDENTITY } from './reports/brand';
import { v4 as uuidv4 } from 'uuid';

export const SUPPORT_TICKET_CATEGORIES = [
  'account', 'savings', 'shares', 'contributions', 'welfare',
  'loans', 'fines', 'documents', 'statement', 'other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export interface SupportTicket {
  id: string;
  ticket_reference: string;
  member_id: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: string;
  admin_response: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupportTicketInput {
  category?: string;
  subject: string;
  message: string;
  source?: string;
}

/** SUP-YYYYMMDD-XXXX (date + random suffix, checked unique by the DB). */
export function generateTicketReference(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `SUP-${date}-${uuidv4().split('-')[0].toUpperCase()}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

class SupportTicketService {
  async createForMember(memberId: string, input: CreateSupportTicketInput): Promise<SupportTicket> {
    const supabase = await createServiceClient();

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, member_number, first_name, last_name, email')
      .eq('id', memberId)
      .maybeSingle();
    if (memberError) throw new Error(`Failed to load member: ${memberError.message}`);
    if (!member) throw new Error('Member not found');

    const category = (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(input.category || '')
      ? (input.category as SupportTicketCategory)
      : 'other';

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        ticket_reference: generateTicketReference(),
        member_id: memberId,
        category,
        subject: input.subject.trim(),
        message: input.message.trim(),
        source: input.source || 'member_portal',
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create support ticket: ${error.message}`);

    // Audit trail (best-effort per project convention)
    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'support_ticket.create',
        record_id: ticket.id,
        before_value: null,
        after_value: { ticket_reference: ticket.ticket_reference, category, subject: ticket.subject },
        description: `Support ticket ${ticket.ticket_reference} created by member ${member.member_number} (${category}): ${ticket.subject}`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[support] audit log failed:', (e as Error)?.message);
    }

    const memberName = `${member.first_name} ${member.last_name}`.trim();
    const orgName = (await settingsService.get('organization.name').catch(() => null)) || ORG_IDENTITY.name;
    const variables = {
      member_name: memberName,
      member_number: member.member_number,
      organization_name: orgName,
      ticket_reference: ticket.ticket_reference,
      subject: ticket.subject,
      category: ticket.category,
      message: ticket.message,
    };

    // Member confirmation (best-effort)
    try {
      await notificationService.sendFromTemplate(
        'support.ticket.received',
        { id: member.id, type: 'member', email: member.email || undefined, name: memberName },
        variables,
        {
          source_module: 'support',
          source_entity_type: 'support_ticket',
          source_entity_id: ticket.id,
          source_action: 'created',
          idempotency_key: `support-received-${ticket.id}`,
        }
      );
    } catch (e) {
      console.warn('[support] member confirmation failed:', (e as Error)?.message);
    }

    // Admin alert (best-effort, per admin — sendFromTemplate needs a concrete recipient)
    try {
      const { data: admins } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('role', ['admin', 'super_admin'])
        .eq('is_active', true);
      for (const admin of admins || []) {
        await notificationService
          .sendFromTemplate(
            'admin.support_ticket_received',
            { id: admin.id, type: 'user', email: admin.email, name: admin.full_name },
            variables,
            {
              source_module: 'support',
              source_entity_type: 'support_ticket',
              source_entity_id: ticket.id,
              source_action: 'created',
              idempotency_key: `support-admin-${ticket.id}-${admin.id}`,
            }
          )
          .catch((e) => console.warn(`[support] admin notify ${admin.id} failed:`, (e as Error)?.message));
      }
    } catch (e) {
      console.warn('[support] admin alerts failed:', (e as Error)?.message);
    }

    return ticket as SupportTicket;
  }

  async listForMember(memberId: string): Promise<SupportTicket[]> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list support tickets: ${error.message}`);
    return (data || []) as SupportTicket[];
  }

  async listAll(opts?: { status?: string; category?: string; limit?: number }): Promise<Array<SupportTicket & { member?: { member_number: string; first_name: string; last_name: string } | null }>> {
    const supabase = await createServiceClient();
    let query = supabase
      .from('support_tickets')
      .select('*, member:members(member_number, first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 200);
    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.category) query = query.eq('category', opts.category);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list support tickets: ${error.message}`);
    return (data || []) as never;
  }

  async updateStatus(
    ticketId: string,
    patch: { status: string; admin_response?: string | null },
    adminId: string,
  ): Promise<SupportTicket> {
    if (!(SUPPORT_TICKET_STATUSES as readonly string[]).includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    const supabase = await createServiceClient();

    const update: Record<string, unknown> = { status: patch.status };
    if (patch.admin_response !== undefined) update.admin_response = patch.admin_response;
    if (patch.status === 'resolved' || patch.status === 'closed') {
      update.resolved_by = adminId;
      update.resolved_at = new Date().toISOString();
    } else {
      update.resolved_by = null;
      update.resolved_at = null;
    }

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update(update)
      .eq('id', ticketId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update support ticket: ${error.message}`);
    if (!ticket) throw new Error('Support ticket not found');

    // Notify the member of the status change (best-effort)
    try {
      const { data: member } = await supabase
        .from('members')
        .select('id, member_number, first_name, last_name, email')
        .eq('id', ticket.member_id)
        .maybeSingle();
      if (member) {
        const orgName = (await settingsService.get('organization.name').catch(() => null)) || ORG_IDENTITY.name;
        await notificationService.sendFromTemplate(
          'support.ticket.updated',
          {
            id: member.id,
            type: 'member',
            email: member.email || undefined,
            name: `${member.first_name} ${member.last_name}`.trim(),
          },
          {
            member_name: `${member.first_name} ${member.last_name}`.trim(),
            organization_name: orgName,
            ticket_reference: ticket.ticket_reference,
            subject: ticket.subject,
            status_label: statusLabel(ticket.status),
            admin_response_block: ticket.admin_response
              ? `Response from the office:\n${ticket.admin_response}`
              : 'No additional response was recorded.',
          },
          {
            source_module: 'support',
            source_entity_type: 'support_ticket',
            source_entity_id: ticket.id,
            source_action: 'status_changed',
            idempotency_key: `support-updated-${ticket.id}-${ticket.status}-${Date.now()}`,
          }
        );
      }
    } catch (e) {
      console.warn('[support] member update notification failed:', (e as Error)?.message);
    }

    return ticket as SupportTicket;
  }
}

export const supportTicketService = new SupportTicketService();
