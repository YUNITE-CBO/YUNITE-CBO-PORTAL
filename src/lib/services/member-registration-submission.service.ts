/**
 * MEMBER REGISTRATION SUBMISSION SERVICE
 *
 * Pre-registration / data-collection layer that sits AHEAD of the existing
 * MemberRegistrationService.register() engine. It ONLY collects applicant
 * information and manages the submission lifecycle. It NEVER creates a
 * member, account, workspace, or financial record — that remains the
 * exclusive responsibility of the existing registration engine.
 *
 * Flow:
 *   public form -> create()           (status: submitted)
 *   admin opens   -> markReviewing()   (status: reviewing)
 *   admin clicks Register Member (existing engine) -> markRegistered()
 *                                                   (status: registered, linked)
 *   admin declines -> reject()         (status: rejected)
 *
 * The original submitted payload is preserved verbatim in `submitted_data`
 * for audit even if the admin edits fields before registering.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { notificationService } from './notifications';
import { configurationService } from './configuration.service';
import { ORG_IDENTITY } from './reports/brand';

/**
 * The exact field set captured by the existing registration form/API
 * (src/app/api/members/route.ts registrationSchema). Keeping this a single
 * shared type means the public form, the auto-fill mapping, and the real
 * registration engine all agree on the same fields.
 */
export interface RegistrationSubmissionData {
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  alt_phone?: string;
  alt_email?: string;
  id_number?: string;
  kra_pin?: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  nationality?: string;
  physical_address?: string;
  postal_address?: string;
  occupation?: string;
  employer?: string;
  employer_address?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relationship?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

export type SubmissionStatus =
  | 'submitted'
  | 'reviewing'
  | 'registered'
  | 'rejected'
  | 'archived';

/**
 * 'register' = a brand-new applicant. 'update' = the applicant's ID number or
 * phone already matches an existing member; the public form pre-filled the
 * EXISTING record and the applicant edited it — an admin applies the changes
 * to that member instead of registering a duplicate profile.
 */
export type SubmissionIntent = 'register' | 'update';

export interface MemberRegistrationSubmission extends RegistrationSubmissionData {
  id: string;
  submission_reference: string;
  status: SubmissionStatus;
  intent: SubmissionIntent;
  existing_member_id: string | null;
  update_applied_at: string | null;
  update_applied_by: string | null;
  registered_member_id: string | null;
  registered_member_number: string | null;
  registered_at: string | null;
  registered_by: string | null;
  duplicate_flagged: boolean;
  duplicate_match: Record<string, string> | null;
  submitted_data: RegistrationSubmissionData;
  submission_source: string | null;
  ip_address: string | null;
  user_agent: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Thrown when a 'register' submission collides with an existing member on
 * id_number and/or phone. The API route maps this to HTTP 409 so the public
 * form can offer the "load my existing record" update flow instead.
 */
export class DuplicateMemberError extends Error {
  matches: DuplicateMatch['match'];
  constructor(matches: DuplicateMatch['match']) {
    const fields = Object.keys(matches).map((f) => f.replace('_', ' ')).join(' and ');
    const memberNumbers = Object.values(matches)
      .map((m) => m.member_number)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ');
    super(
      `A member with this ${fields} already exists in the system (member no. ${memberNumbers}). ` +
      `Duplicate profiles are not allowed — use the "Already registered? Find my record" option to review and update the existing record instead.`
    );
    this.name = 'DuplicateMemberError';
    this.matches = matches;
  }
}

export interface DuplicateMatch {
  flagged: boolean;
  match: Record<string, { member_id: string; member_number: string; name: string }>;
}

export interface SubmissionQueryParams {
  query?: string;
  status?: SubmissionStatus | 'all';
  includeRegistered?: boolean;
  page?: number;
  limit?: number;
}

class MemberRegistrationSubmissionService {
  /**
   * Create a new pre-registration submission from the public form.
   * Does NOT create a member.
   *
   * Duplicate policy (id_number / phone are identity fields):
   *   - intent 'register' (default): a match on id_number or phone means the
   *     profile already exists — the submission is REFUSED with
   *     DuplicateMemberError (HTTP 409) so no duplicate profile can enter the
   *     system. Email matches stay advisory flags only.
   *   - intent 'update': the applicant identified themselves via the public
   *     lookup; the submission is LINKED to the existing member
   *     (existing_member_id) and an admin later applies the edits — no new
   *     member is ever registered from it.
   */
  async create(
    data: RegistrationSubmissionData,
    opts: {
      ipAddress?: string;
      userAgent?: string;
      source?: string;
      intent?: SubmissionIntent;
      existingMemberId?: string;
    } = {}
  ): Promise<{ submission: MemberRegistrationSubmission; duplicates: DuplicateMatch }> {
    const supabase = await createServiceClient();

    // Public form gating: admins can close the form via settings.
    const enabled = (await configurationService.getSetting('registration.public_enabled')) ?? 'true';
    if (enabled !== 'true') {
      throw new Error('Public member registration is currently closed. Please contact the organization.');
    }

    // Duplicate detection against EXISTING members (read-only).
    const duplicates = await this.detectDuplicates(data);
    const intent: SubmissionIntent = opts.intent === 'update' ? 'update' : 'register';

    let existingMemberId: string | null = null;
    if (intent === 'update') {
      // Resolve the member this update targets: an explicit id wins, else the
      // id_number/phone match. An update against nothing is meaningless.
      existingMemberId =
        opts.existingMemberId ||
        duplicates.match.id_number?.member_id ||
        duplicates.match.phone?.member_id ||
        null;
      if (!existingMemberId) {
        throw new Error(
          'No existing member record was found for this ID number/phone. Submit as a new registration instead.'
        );
      }
    } else if (duplicates.match.id_number || duplicates.match.phone) {
      // HARD duplicate rejection: id_number/phone uniquely identify a member.
      throw new DuplicateMemberError({
        ...(duplicates.match.id_number ? { id_number: duplicates.match.id_number } : {}),
        ...(duplicates.match.phone ? { phone: duplicates.match.phone } : {}),
      });
    }

    const submission_reference = await this.generateReference();
    const insertPayload: Record<string, unknown> = {
      id: uuidv4(),
      submission_reference,
      ...data,
      status: 'submitted',
      intent,
      existing_member_id: existingMemberId,
      duplicate_flagged: duplicates.flagged,
      duplicate_match: duplicates.match as unknown as Record<string, string> | null,
      submitted_data: data as unknown as Record<string, unknown>,
      submission_source: opts.source || 'public_form',
      ip_address: opts.ipAddress || null,
      user_agent: opts.userAgent || null,
    };
    let { data: row, error } = await supabase
      .from('member_registration_submissions')
      .insert(insertPayload)
      .select()
      .single();

    // Migration 041 not yet applied: the intent/existing_member_id columns do
    // not exist. Retry without them, embedding the update linkage inside the
    // submitted_data JSON so applyUpdate() can still resolve it.
    if (error && /intent|existing_member_id/i.test(error.message || '')) {
      const fallback = { ...insertPayload };
      delete fallback.intent;
      delete fallback.existing_member_id;
      fallback.submitted_data = {
        ...(data as unknown as Record<string, unknown>),
        _intent: intent,
        _existing_member_id: existingMemberId,
      };
      ({ data: row, error } = await supabase
        .from('member_registration_submissions')
        .insert(fallback)
        .select()
        .single());
      if (row && !row.intent) row.intent = intent;
    }

    if (error || !row) {
      throw new Error(`Failed to create submission: ${error?.message}`);
    }

    // Audit log (best-effort — must never fail the submission).
    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.create',
        record_id: row.id,
        before_value: null,
        after_value: { submission_reference, name: `${data.first_name} ${data.last_name}`, phone: data.phone },
        description: `New pre-registration submission: ${submission_reference}`,
        ip_address: opts.ipAddress || null,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to audit submission create:', e);
    }

    // Admin notification (best-effort).
    try {
      const notifyEnabled = (await configurationService.getSetting('registration.notify_admins')) ?? 'true';
      if (notifyEnabled === 'true') {
        await this.notifyAdminsOfNewSubmission(row);
      }
    } catch (e) {
      console.warn('Failed to notify admins of new submission:', e);
    }

    // Applicant confirmation email (best-effort — only if email provided).
    try {
      if (data.email) {
        await this.sendApplicantConfirmation(row);
      }
    } catch (e) {
      console.warn('Failed to send applicant confirmation:', e);
    }

    return { submission: row as MemberRegistrationSubmission, duplicates };
  }

  /**
   * List/search submissions for the admin queue. Excludes archived by default;
   * registered entries only included when includeRegistered=true.
   */
  async list(params: SubmissionQueryParams = {}): Promise<{
    submissions: MemberRegistrationSubmission[];
    total: number;
    page: number;
    limit: number;
  }> {
    const supabase = await createServiceClient();
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('member_registration_submissions')
      .select('*', { count: 'exact' });

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    } else if (!params.includeRegistered) {
      // Default queue view: waiting applicants only (hide already-registered).
      query = query.in('status', ['submitted', 'reviewing']);
    }

    if (params.query) {
      const q = params.query.trim();
      // Search across name, id_number, phone, email, and submission_reference.
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,id_number.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,submission_reference.ilike.%${q}%`
      );
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      submissions: (data || []) as MemberRegistrationSubmission[],
      total: count || 0,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<MemberRegistrationSubmission | null> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('member_registration_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data as MemberRegistrationSubmission) || null;
  }

  /**
   * Mark a submission as being reviewed (admin opened / auto-filled it).
   * Idempotent — does not downgrade a registered/rejected submission.
   */
  async markReviewing(id: string, adminUserId: string): Promise<void> {
    const supabase = await createServiceClient();
    const existing = await this.getById(id);
    if (!existing) return;
    if (existing.status === 'registered' || existing.status === 'rejected') return;

    await supabase
      .from('member_registration_submissions')
      .update({
        status: 'reviewing',
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUserId,
      })
      .eq('id', id);

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.view',
        record_id: id,
        user_id: adminUserId,
        description: `Submission ${existing.submission_reference} opened for review`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to audit submission view:', e);
    }
  }

  /**
   * Mark a submission REGISTERED and link it to the newly created member.
   * Called AFTER the existing MemberRegistrationService.register() succeeds.
   * This is what prevents double-registration: once linked, the submission
   * leaves the waiting queue and auto-fill refuses to re-use it.
   *
   * Re-runs duplicate detection against members at link time as a final guard.
   */
  async markRegistered(
    id: string,
    memberId: string,
    memberNumber: string,
    adminUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();
    const existing = await this.getById(id);
    if (!existing) {
      return { success: false, error: 'Submission not found' };
    }

    // Terminal-state guard: a submission already linked to a member cannot be
    // linked again (prevents a second member being created from the same data).
    if (existing.status === 'registered' && existing.registered_member_id) {
      return {
        success: false,
        error: `This submission was already registered as member ${existing.registered_member_number}.`,
      };
    }

    const { error } = await supabase
      .from('member_registration_submissions')
      .update({
        status: 'registered',
        registered_member_id: memberId,
        registered_member_number: memberNumber,
        registered_at: new Date().toISOString(),
        registered_by: adminUserId,
        reviewed_at: existing.reviewed_at || new Date().toISOString(),
        reviewed_by: existing.reviewed_by || adminUserId,
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: `Failed to link submission: ${error.message}` };
    }

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.registered',
        record_id: id,
        user_id: adminUserId,
        after_value: { member_id: memberId, member_number: memberNumber },
        description: `Submission ${existing.submission_reference} registered as member ${memberNumber}`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to audit submission registration:', e);
    }

    return { success: true };
  }

  async reject(
    id: string,
    adminUserId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();
    const existing = await this.getById(id);
    if (!existing) return { success: false, error: 'Submission not found' };
    if (existing.status === 'registered') {
      return { success: false, error: 'Cannot reject a submission that is already registered.' };
    }

    const { error } = await supabase
      .from('member_registration_submissions')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUserId,
      })
      .eq('id', id);

    if (error) return { success: false, error: error.message };

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.rejected',
        record_id: id,
        user_id: adminUserId,
        after_value: { reason },
        description: `Submission ${existing.submission_reference} rejected`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to audit submission rejection:', e);
    }

    return { success: true };
  }

  async archive(id: string, adminUserId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from('member_registration_submissions')
      .update({ status: 'archived' })
      .eq('id', id);
    if (error) return { success: false, error: error.message };

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.archived',
        record_id: id,
        user_id: adminUserId,
        description: `Submission archived`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to audit submission archive:', e);
    }
    return { success: true };
  }

  /**
   * Detect whether an existing member already shares id_number / phone / email
   * with the submitted data. Read-only — never blocks submission, just flags
   * it for the admin to review during auto-fill.
   */
  async detectDuplicates(data: RegistrationSubmissionData): Promise<DuplicateMatch> {
    const supabase = await createServiceClient();
    const match: DuplicateMatch['match'] = {};

    const checks: Array<{ field: keyof typeof data; column: string; value?: string }> = [
      { field: 'id_number', column: 'id_number', value: data.id_number },
      { field: 'phone', column: 'phone', value: data.phone },
      { field: 'email', column: 'email', value: data.email },
    ];

    for (const c of checks) {
      if (!c.value) continue;
      const { data: found } = await supabase
        .from('members')
        .select('id, member_number, first_name, last_name')
        .ilike(c.column, c.value)
        .limit(1)
        .maybeSingle();
      if (found) {
        match[c.field] = {
          member_id: found.id,
          member_number: found.member_number,
          name: `${found.first_name} ${found.last_name}`,
        };
      }
    }

    return { flagged: Object.keys(match).length > 0, match };
  }

  /**
   * Re-check duplicates against members at auto-fill time (the member set may
   * have changed since submission). Returns the fresh match for the admin UI.
   */
  async refreshDuplicates(id: string): Promise<DuplicateMatch> {
    const existing = await this.getById(id);
    if (!existing) return { flagged: false, match: {} };
    return this.detectDuplicates(existing);
  }

  /**
   * PUBLIC lookup used by the pre-registration form: find an existing member
   * by EXACT id_number and/or phone so the form can open in "pre-edit" mode
   * with the member's on-file data instead of creating a duplicate profile.
   * Exact, case-insensitive, single-record match only — no fuzzy search (that
   * would make the member list enumerable).
   */
  async lookupExistingMember(identifier: {
    id_number?: string;
    phone?: string;
  }): Promise<Record<string, unknown> | null> {
    const supabase = await createServiceClient();
    const idNumber = identifier.id_number?.trim();
    const phone = identifier.phone?.trim();
    if (!idNumber && !phone) return null;

    if (idNumber) {
      const { data } = await supabase
        .from('members')
        .select('*')
        .ilike('id_number', idNumber)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    if (phone) {
      const { data } = await supabase
        .from('members')
        .select('*')
        .ilike('phone', phone)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    return null;
  }

  /** The registration fields an update submission is allowed to apply. */
  private static readonly UPDATE_FIELDS: (keyof RegistrationSubmissionData)[] = [
    'first_name', 'last_name', 'email', 'phone', 'alt_phone', 'alt_email',
    'id_number', 'kra_pin', 'date_of_birth', 'gender', 'marital_status',
    'nationality', 'physical_address', 'postal_address', 'occupation',
    'employer', 'employer_address', 'next_of_kin_name', 'next_of_kin_phone',
    'next_of_kin_relationship', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relationship',
  ];

  /**
   * Apply an update-intent submission to its linked existing member. Only
   * non-empty submitted fields are written — a blank field in the form never
   * erases on-file data. Marks the submission processed (status 'registered',
   * linked to the UPDATED member) so it leaves the queue and cannot be
   * applied twice.
   */
  async applyUpdate(
    id: string,
    adminUserId: string
  ): Promise<{ success: boolean; error?: string; member?: { id: string; member_number: string } }> {
    const supabase = await createServiceClient();
    const existing = await this.getById(id);
    if (!existing) return { success: false, error: 'Submission not found' };

    const submitted = (existing.submitted_data || {}) as unknown as Record<string, unknown>;
    const intent: SubmissionIntent =
      existing.intent || (submitted._intent === 'update' ? 'update' : 'register');
    if (intent !== 'update') {
      return { success: false, error: 'Only update submissions can be applied to an existing member. Use Register Member for new applicants.' };
    }
    const targetMemberId =
      existing.existing_member_id || (submitted._existing_member_id as string | undefined) || null;
    if (!targetMemberId) {
      return { success: false, error: 'This update submission is not linked to an existing member.' };
    }
    if (existing.update_applied_at || submitted._update_applied_at) {
      return { success: false, error: 'This update has already been applied.' };
    }
    if (existing.status === 'registered' || existing.status === 'rejected') {
      return { success: false, error: 'This submission is already closed and cannot be applied.' };
    }

    const { data: member } = await supabase
      .from('members')
      .select('id, member_number')
      .eq('id', targetMemberId)
      .maybeSingle();
    if (!member) {
      return { success: false, error: 'The linked member no longer exists.' };
    }

    // Build the member patch from non-empty submitted fields only.
    const patch: Record<string, unknown> = {};
    for (const field of MemberRegistrationSubmissionService.UPDATE_FIELDS) {
      const v = submitted[field];
      if (v !== undefined && v !== null && v !== '') patch[field] = v;
    }
    if (Object.keys(patch).length === 0) {
      return { success: false, error: 'Nothing to apply — the submission carries no profile fields.' };
    }
    patch.updated_at = new Date().toISOString();

    const { error: upErr } = await supabase.from('members').update(patch).eq('id', targetMemberId);
    if (upErr) {
      return { success: false, error: `Failed to update member: ${upErr.message}` };
    }

    const now = new Date().toISOString();
    let { error: subErr } = await supabase
      .from('member_registration_submissions')
      .update({
        status: 'registered',
        registered_member_id: targetMemberId,
        registered_member_number: member.member_number,
        registered_at: now,
        registered_by: adminUserId,
        update_applied_at: now,
        update_applied_by: adminUserId,
        reviewed_at: existing.reviewed_at || now,
        reviewed_by: existing.reviewed_by || adminUserId,
      })
      .eq('id', id);
    // Migration 041 not yet applied: drop the new columns.
    if (subErr && /update_applied/i.test(subErr.message || '')) {
      ({ error: subErr } = await supabase
        .from('member_registration_submissions')
        .update({
          status: 'registered',
          registered_member_id: targetMemberId,
          registered_member_number: member.member_number,
          registered_at: now,
          registered_by: adminUserId,
        })
        .eq('id', id));
    }
    if (subErr) {
      return { success: false, error: `Member updated but failed to close the submission: ${subErr.message}` };
    }

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'member_registration_submission.update_applied',
        record_id: id,
        user_id: adminUserId,
        after_value: { member_id: targetMemberId, member_number: member.member_number, fields: Object.keys(patch) },
        description: `Update submission ${existing.submission_reference} applied to member ${member.member_number} (${Object.keys(patch).length} fields)`,
        created_at: now,
      });
    } catch (e) {
      console.warn('Failed to audit submission update:', e);
    }

    return { success: true, member: { id: targetMemberId, member_number: member.member_number } };
  }

  /**
   * Determine the public registration URL for this deployment. Derived from
   * a request origin when available so it is always correct; falls back to
   * the configured registration.url setting, then to a relative path.
   */
  resolvePublicUrl(origin?: string | null): string {
    if (origin) return `${origin.replace(/\/$/, '')}/register/member`;
    const configured = ORG_IDENTITY.website
      ? `${ORG_IDENTITY.website.replace(/\/$/, '')}/register/member`
      : '/register/member';
    return configured;
  }

  private async generateReference(): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    const ref = `MRS-${date}-${rand}`;
    return ref;
  }

  private async notifyAdminsOfNewSubmission(submission: MemberRegistrationSubmission): Promise<void> {
    const applicantName = `${submission.first_name} ${submission.last_name}`;
    const variables = {
      applicant_name: applicantName,
      phone: submission.phone || '—',
      email: submission.email || '—',
      id_number: submission.id_number || '—',
      submitted_at: new Date(submission.created_at).toLocaleString(),
      submission_reference: submission.submission_reference,
    };

    // Resolve admin users (same approach as event.service.getAdminRecipients)
    // and send an in-app notification to each. sendFromTemplate requires a
    // concrete recipient (type 'user' + id); there is no role-based shortcut.
    const supabase = await createServiceClient();
    const { data: admins } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true);

    for (const admin of admins || []) {
      try {
        await notificationService.sendFromTemplate(
          'admin.member_submission_received',
          { id: admin.id, type: 'user', email: admin.email, name: admin.full_name },
          variables,
          {
            source_module: 'member-registration',
            source_entity_type: 'member_registration_submission',
            source_entity_id: submission.id,
            source_action: 'submitted',
            idempotency_key: `submission-notify-${submission.id}-${admin.id}`,
          }
        );
      } catch (e) {
        console.warn(`Failed to notify admin ${admin.id}:`, e);
      }
    }
  }

  private async sendApplicantConfirmation(submission: MemberRegistrationSubmission): Promise<void> {
    // The applicant is not yet a user/member, so sendFromTemplate (which
    // requires a concrete recipient id + type 'member'|'user') cannot target
    // them. Create a 'system' notification addressed to their email and queue
    // the email directly. Best-effort — never fails the submission.
    const supabase = await createServiceClient();
    const applicantName = `${submission.first_name} ${submission.last_name}`;
    const subject = `Your registration information has been received — ${ORG_IDENTITY.name}`;
    const body = `Hello ${applicantName},

Thank you for submitting your information to ${ORG_IDENTITY.name}.

Your submission has been received and is awaiting processing by our administrators.

Reference: ${submission.submission_reference}

IMPORTANT: This submission does NOT automatically make you a registered member. A YUNITE administrator will review your information and complete your registration. You will be contacted once your membership has been processed.

If you did not submit this information, please ignore this message.

— ${ORG_IDENTITY.name}`;

    const { data: notification } = await supabase
      .from('notifications')
      .insert({
        id: uuidv4(),
        notification_ref: `NTF-APP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        template_code: 'applicant.submission_received',
        subject,
        body,
        title: subject,
        message: body,
        rendered_variables: { applicant_name: applicantName, org_name: ORG_IDENTITY.name, submission_reference: submission.submission_reference },
        priority: 'normal',
        recipient_type: 'system',
        recipient_email: submission.email,
        recipient_name: applicantName,
        source_module: 'member-registration',
        source_entity_type: 'member_registration_submission',
        source_entity_id: submission.id,
        source_action: 'submitted',
        status: 'pending',
      })
      .select('id')
      .single();

    if (notification) {
      await supabase.from('email_queue').insert({
        id: uuidv4(),
        notification_id: notification.id,
        to_email: submission.email!,
        to_name: applicantName,
        subject,
        text_body: body,
        priority: 0,
        status: 'pending',
      });
    }
  }
}

export const memberRegistrationSubmissionService = new MemberRegistrationSubmissionService();
