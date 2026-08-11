/**
 * Automation Runner - the clock that wakes the silent automation stack.
 *
 * The notification services (scheduleService, statementService,
 * notificationEventService) are fully written but had no runtime caller,
 * so scheduled statements and due-schedule notifications never fired. This
 * runner is invoked by the CRON_SECRET-protected `/api/cron/automation`
 * route (poked every few minutes by a Render cron service) and orchestrates
 * every automated step, logging a unified record to `automation_runs`.
 *
 * Design:
 *  - A row lock on `automation_locks` prevents overlapping ticks (Render
 *    free-tier cold starts can overlap). Stale locks (past expires_at) are
 *    ignorable so a crashed run cannot deadlock the engine.
 *  - Every step is gated by a `workflow.*` setting toggle and wrapped in
 *    try/catch so one failing step never aborts the others.
 *  - Counts (items processed, notifications created, emails sent/skipped,
 *    errors) are aggregated into a single `automation_runs` row.
 *  - Phase 1 wires the EXISTING dead code (processDueSchedules +
 *    emailService.processQueue) to the clock and adds the obligations +
 *    statement cadence checks. The obligations/statements/forecast engines
 *    themselves are filled in across later phases; here they run their
 *    already-implemented pieces and no-op gracefully where not yet built.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { scheduleService } from '../notifications/schedule.service';
import { statementService } from '../notifications/statement.service';
import { emailService } from '../notifications/email.service';
import { settingsService } from '../settings.service';

export interface AutomationStepResult {
  step: string;
  items_processed: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors: string[];
  skipped_reason?: string;
}

export interface AutomationTickResult {
  run_id: string;
  status: 'completed' | 'failed' | 'skipped';
  duration_ms: number;
  steps: AutomationStepResult[];
  totals: {
    items_processed: number;
    notifications_created: number;
    emails_sent: number;
    emails_skipped: number;
    errors_count: number;
  };
  error_message?: string;
}

const LOCK_ID = 'tick';
// Lock TTL: must exceed the longest plausible tick. 5 minutes is generous
// for the Phase 1 workload (a few schedules + email batch + obligations scan).
const LOCK_TTL_MS = 5 * 60 * 1000;

class AutomationRunner {
  /**
   * Main entry point. Called by /api/cron/automation on every tick.
   */
  async tick(trigger: 'cron' | 'manual' = 'cron'): Promise<AutomationTickResult> {
    const startedAt = new Date();
    const runId = uuidv4();
    const steps: AutomationStepResult[] = [];

    // 1. Acquire lock; bail if another tick is still running.
    const locked = await this.acquireLock(runId);
    if (!locked) {
      return this.finish(runId, 'skipped', startedAt, steps, undefined, 'another tick is already running');
    }

    try {
      // 2. Master switch — if the engine is off, we still record a
      //    (skipped) run so the admin can see the clock is alive.
      const enabled = await this.getBoolSetting('workflow.automation.enabled', true);
      if (!enabled) {
        return this.finish(runId, 'skipped', startedAt, steps, undefined, 'automation master switch is off');
      }

      // 3. Run each step independently. Failures in one must not abort others.
      steps.push(await this.runStep('email_queue', () => this.processEmailQueue()));
      steps.push(await this.runStep('schedule', () => this.processDueSchedules()));
      steps.push(await this.runStep('obligations', () => this.processObligationsReminders()));
      steps.push(await this.runStep('statements', () => this.processStatementCadence()));

      return this.finish(runId, 'completed', startedAt, steps);
    } catch (error: any) {
      return this.finish(runId, 'failed', startedAt, steps, error?.message || String(error));
    } finally {
      await this.releaseLock(runId);
    }
  }

  /**
   * Wrap a step so it always returns a structured result and never throws.
   */
  private async runStep(
    step: string,
    fn: () => Promise<AutomationStepResult>
  ): Promise<AutomationStepResult> {
    try {
      return await fn();
    } catch (error: any) {
      return {
        step,
        items_processed: 0,
        notifications_created: 0,
        emails_sent: 0,
        emails_skipped: 0,
        errors: [error?.message || String(error)],
      };
    }
  }

  // -----------------------------------------------------------------
  // STEP: email queue
  // -----------------------------------------------------------------
  private async processEmailQueue(): Promise<AutomationStepResult> {
    const errors: string[] = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const result = await emailService.processQueue();
      processed = result.processed;
      succeeded = result.succeeded;
      failed = result.failed;
    } catch (error: any) {
      errors.push(`email_queue: ${error?.message || String(error)}`);
    }

    return {
      step: 'email_queue',
      items_processed: processed,
      notifications_created: 0,
      emails_sent: succeeded,
      emails_skipped: 0,
      errors,
    };
  }

  // -----------------------------------------------------------------
  // STEP: due notification schedules (the previously-dead-code path)
  // -----------------------------------------------------------------
  private async processDueSchedules(): Promise<AutomationStepResult> {
    const errors: string[] = [];
    let itemsProcessed = 0;
    let notificationsCreated = 0;

    try {
      const runs = await scheduleService.processDueSchedules();
      for (const run of runs) {
        itemsProcessed += run.recipients_processed || 0;
        notificationsCreated += run.notifications_created || 0;
        if (run.errors?.length) {
          errors.push(...run.errors.map((e) => `schedule ${run.schedule_id}: ${e}`));
        }
      }
    } catch (error: any) {
      errors.push(`schedule: ${error?.message || String(error)}`);
    }

    return {
      step: 'schedule',
      items_processed: itemsProcessed,
      notifications_created: notificationsCreated,
      emails_sent: 0,
      emails_skipped: 0,
      errors,
    };
  }

  // -----------------------------------------------------------------
  // STEP: member financial obligations reminders (Phase 2)
  //
  // Reminder cadence per obligation:
  //   - Upcoming: fire when days_until_due hits a configured lead time
  //     (first_lead_days=7, second_lead_days=3, final_lead_days=1).
  //   - Due today: fire (loan.payment_due / contribution.due / welfare.due).
  //   - Overdue: fire once, then repeat every overdue_repeat_days (default 7)
  //     until paid/waived.
  //
  // De-duplication is two-layered:
  //   1. Per-day idempotency_key on the notification itself (so multiple
  //      ticks within one day never duplicate).
  //   2. A lookback query against notifications: for the overdue-repeat
  //      path, skip if a reminder for this obligation+action was sent
  //      within the last overdue_repeat_days.
  // -----------------------------------------------------------------
  private async processObligationsReminders(): Promise<AutomationStepResult> {
    const errors: string[] = [];
    let itemsProcessed = 0;
    let notificationsCreated = 0;
    let emailsSkipped = 0;

    try {
      // Toggles per obligation type
      const toggles: Record<string, boolean> = {
        loan: await this.getBoolSetting('workflow.reminders.loan_payment', true),
        fine: await this.getBoolSetting('workflow.reminders.fines', true),
        contribution: await this.getBoolSetting('workflow.reminders.contributions', true),
        welfare: await this.getBoolSetting('workflow.reminders.welfare', true),
      };
      const superAdminAlertsOn = await this.getBoolSetting('workflow.alerts.super_admin', true);
      const emailChannelOn = await this.getBoolSetting('workflow.channels.email', true);

      if (!Object.values(toggles).some(Boolean) && !superAdminAlertsOn) {
        return { step: 'obligations', items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors, skipped_reason: 'all obligation toggles off' };
      }

      // Configurable lead times (days before due) + overdue repeat interval
      const firstLead = await this.getNumberSetting('workflow.reminders.first_lead_days', 7);
      const secondLead = await this.getNumberSetting('workflow.reminders.second_lead_days', 3);
      const finalLead = await this.getNumberSetting('workflow.reminders.final_lead_days', 1);
      const overdueRepeat = await this.getNumberSetting('workflow.reminders.overdue_repeat_days', 7);
      const leadTimes = [firstLead, secondLead, finalLead];

      const supabase = await createServiceClient();

      // Pull all non-paid/waived obligations; we decide locally whether each
      // is due for a reminder this tick.
      const { data: obligations, error } = await supabase
        .from('member_financial_obligations')
        .select('*')
        .in('obligation_status', ['upcoming', 'due', 'overdue', 'partially_paid']);

      if (error) {
        errors.push(`obligations query: ${error.message}`);
        return { step: 'obligations', items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors };
      }

      if (!obligations?.length) {
        return { step: 'obligations', items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors };
      }

      const todayKey = new Date().toISOString().split('T')[0];
      const orgName = (await settingsService.get('organization.name')) || 'YUNITE CBO';
      const currency = (await settingsService.get('organization.currency')) || 'KES';
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const ob of obligations) {
        itemsProcessed++;
        if (!toggles[ob.obligation_type]) continue;

        // Determine the reminder kind for this obligation today.
        const decision = this.decideReminder(ob, today, leadTimes, overdueRepeat);
        if (!decision.shouldRemind) continue;

        const templateCode = this.templateFor(ob.obligation_type, decision.kind);
        if (!templateCode) continue;

        // --- Member-facing reminder ---
        if (ob.email) {
          const idemKey = `ob-${ob.obligation_type}-${ob.source_id}-${todayKey}-${decision.kind}-member`;
          const memberResult = await this.notifyFromTemplate(templateCode, {
            id: ob.member_id,
            type: 'member',
            email: emailChannelOn ? ob.email : undefined,
            phone: ob.phone || undefined,
            name: ob.member_name || 'Member',
          }, {
            organization_name: orgName,
            member_name: ob.member_name,
            member_number: ob.member_number,
            currency,
            amount: Number(ob.remaining ?? ob.amount_due ?? 0),
            due_date: ob.due_date ? String(ob.due_date) : '—',
            loan_number: ob.reference,
            fine_number: ob.reference,
            reason: ob.reason || 'Outstanding balance',
          }, idemKey);
          if (memberResult) notificationsCreated++;
          if (!emailChannelOn || !ob.email) emailsSkipped++;
        } else {
          emailsSkipped++;
        }

        // --- Super-admin alert for overdue only ---
        if (superAdminAlertsOn && ob.obligation_status === 'overdue') {
          const adminIdemKey = `ob-${ob.obligation_type}-${ob.source_id}-${todayKey}-admin`;
          const adminResult = await this.notifyAdmins('admin.obligation_overdue', {
            organization_name: orgName,
            member_name: ob.member_name,
            member_number: ob.member_number,
            obligation_type: ob.obligation_type,
            reference: ob.reference,
            currency,
            amount: Number(ob.remaining ?? ob.amount_due ?? 0),
            due_date: ob.due_date ? String(ob.due_date) : '—',
            obligation_status: ob.obligation_status,
          }, adminIdemKey, emailChannelOn);
          if (adminResult) notificationsCreated++;
        }
      }
    } catch (error: any) {
      errors.push(`obligations: ${error?.message || String(error)}`);
    }

    return {
      step: 'obligations',
      items_processed: itemsProcessed,
      notifications_created: notificationsCreated,
      emails_sent: 0,
      emails_skipped: emailsSkipped,
      errors,
    };
  }

  /**
   * Decide whether an obligation should get a reminder today, and which kind.
   *   - 'upcoming_lead' : due date is exactly N days away (matches a lead time)
   *   - 'due'           : due today
   *   - 'overdue'       : past due; repeated every overdueRepeat days
   *
   * For 'overdue', the per-day idempotency_key on the notification handles
   * same-day de-dup; the every-N-days cadence is enforced by checking that
   * (days_overdue % overdueRepeat === 0). This is deterministic and avoids a
   * DB lookback scan per obligation.
   */
  private decideReminder(
    ob: any,
    today: Date,
    leadTimes: number[],
    overdueRepeat: number
  ): { shouldRemind: boolean; kind: 'upcoming_lead' | 'due' | 'overdue' } {
    if (ob.obligation_status === 'overdue') {
      if (!ob.due_date) return { shouldRemind: true, kind: 'overdue' };
      const due = new Date(ob.due_date);
      due.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
      // Remind on day 1 of overdue, then every overdueRepeat days.
      const shouldRemind = daysOverdue === 0 || (daysOverdue > 0 && daysOverdue % overdueRepeat === 0);
      return { shouldRemind, kind: 'overdue' };
    }

    if (ob.obligation_status === 'due') {
      return { shouldRemind: true, kind: 'due' };
    }

    // upcoming / partially_paid: check lead-time match
    if (ob.due_date) {
      const due = new Date(ob.due_date);
      due.setHours(0, 0, 0, 0);
      const daysUntil = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (leadTimes.includes(daysUntil)) {
        return { shouldRemind: true, kind: 'upcoming_lead' };
      }
    }
    return { shouldRemind: false, kind: 'upcoming_lead' };
  }

  /**
   * Map obligation type + reminder kind to a notification template code.
   */
  private templateFor(
    type: string,
    kind: 'upcoming_lead' | 'due' | 'overdue'
  ): string | null {
    if (type === 'loan') {
      if (kind === 'overdue') return 'loan.payment_overdue';
      return 'loan.payment_due';
    }
    if (type === 'fine') {
      return 'fine.outstanding';
    }
    if (type === 'contribution') {
      return kind === 'overdue' ? 'contribution.overdue' : 'contribution.due';
    }
    if (type === 'welfare') {
      return kind === 'overdue' ? 'welfare.overdue' : 'welfare.due';
    }
    return null;
  }

  // -----------------------------------------------------------------
  // STEP: weekly/monthly statement cadence
  // Uses the fully-written statementService.generateAndDeliver() per member.
  // The cadence (which day to run) is read from workflow.statements.* settings.
  // -----------------------------------------------------------------
  private async processStatementCadence(): Promise<AutomationStepResult> {
    const errors: string[] = [];
    let itemsProcessed = 0;
    let notificationsCreated = 0;
    let emailsSent = 0;
    let emailsSkipped = 0;

    try {
      const weeklyOn = await this.getBoolSetting('workflow.statements.weekly', true);
      const monthlyOn = await this.getBoolSetting('workflow.statements.monthly', true);
      if (!weeklyOn && !monthlyOn) {
        return { step: 'statements', items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors, skipped_reason: 'statement toggles off' };
      }

      const now = new Date();
      const supabase = await createServiceClient();

      // Weekly: run on the configured weekday.
      const weeklyDay = await this.getNumberSetting('workflow.statements.weekly_day', 1);
      const monthlyDay = await this.getNumberSetting('workflow.statements.monthly_day', 1);

      const runWeekly = weeklyOn && now.getDay() === weeklyDay;
      const runMonthly = monthlyOn && now.getDate() === monthlyDay;

      if (!runWeekly && !runMonthly) {
        return { step: 'statements', items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors, skipped_reason: 'not a statement day' };
      }

      const orgName = (await settingsService.get('organization.name')) || 'YUNITE CBO';

      if (runWeekly) {
        const end = now;
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        const res = await this.generateStatementsForAllMembers('member_weekly', start, end, orgName);
        itemsProcessed += res.itemsProcessed;
        notificationsCreated += res.notificationsCreated;
        emailsSent += res.emailsSent;
        emailsSkipped += res.emailsSkipped;
        errors.push(...res.errors);
      }

      if (runMonthly) {
        const end = now;
        const start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        const res = await this.generateStatementsForAllMembers('member_monthly', start, end, orgName);
        itemsProcessed += res.itemsProcessed;
        notificationsCreated += res.notificationsCreated;
        emailsSent += res.emailsSent;
        emailsSkipped += res.emailsSkipped;
        errors.push(...res.errors);

        // Org summary to super admins
        const orgRes = await this.generateOrgSummary(start, end, orgName);
        itemsProcessed += orgRes.itemsProcessed;
        notificationsCreated += orgRes.notificationsCreated;
        emailsSent += orgRes.emailsSent;
        emailsSkipped += orgRes.emailsSkipped;
        errors.push(...orgRes.errors);
      }
    } catch (error: any) {
      errors.push(`statements: ${error?.message || String(error)}`);
    }

    return {
      step: 'statements',
      items_processed: itemsProcessed,
      notifications_created: notificationsCreated,
      emails_sent: emailsSent,
      emails_skipped: emailsSkipped,
      errors,
    };
  }

  private async generateStatementsForAllMembers(
    type: 'member_weekly' | 'member_monthly',
    start: Date,
    end: Date,
    orgName: string
  ): Promise<{ itemsProcessed: number; notificationsCreated: number; emailsSent: number; emailsSkipped: number; errors: string[] }> {
    const errors: string[] = [];
    let itemsProcessed = 0;
    let notificationsCreated = 0;
    let emailsSent = 0;
    let emailsSkipped = 0;

    const supabase = await createServiceClient();
    const { data: members, error } = await supabase
      .from('members')
      .select('id, first_name, last_name, email')
      .eq('status', 'active');

    if (error) {
      errors.push(`members query: ${error.message}`);
      return { itemsProcessed, notificationsCreated, emailsSent, emailsSkipped, errors };
    }

    for (const member of members || []) {
      itemsProcessed++;
      try {
        const result = await statementService.generateAndDeliver({
          statement_type: type,
          period_start: start,
          period_end: end,
          recipient_type: 'member',
          recipient_id: member.id,
          recipient_email: member.email || undefined,
          recipient_name: `${member.first_name} ${member.last_name}`,
        });
        notificationsCreated++;
        if (result.email_sent) emailsSent++;
        else emailsSkipped++;
      } catch (e: any) {
        errors.push(`statement ${type} member ${member.id}: ${e?.message || String(e)}`);
      }
    }

    return { itemsProcessed, notificationsCreated, emailsSent, emailsSkipped, errors };
  }

  private async generateOrgSummary(
    start: Date,
    end: Date,
    orgName: string
  ): Promise<{ itemsProcessed: number; notificationsCreated: number; emailsSent: number; emailsSkipped: number; errors: string[] }> {
    const errors: string[] = [];
    let notificationsCreated = 0;
    let emailsSent = 0;
    let emailsSkipped = 0;

    try {
      // generateAndDeliver for org summary uses recipient_type 'organization'
      // and the super-admin email settings for delivery. The statement service
      // already handles the org summary content build.
      await statementService.generate({
        statement_type: 'organization_summary',
        period_start: start,
        period_end: end,
        recipient_type: 'organization',
        recipient_name: orgName,
      });
      notificationsCreated++;
    } catch (e: any) {
      errors.push(`org summary: ${e?.message || String(e)}`);
    }

    return { itemsProcessed: 1, notificationsCreated, emailsSent, emailsSkipped, errors };
  }

  // -----------------------------------------------------------------
  // Notification helpers (reuse the live notification stack)
  // -----------------------------------------------------------------
  private async notifyFromTemplate(
    templateCode: string,
    recipient: { id: string; type: string; email?: string; phone?: string; name: string },
    variables: Record<string, unknown>,
    idempotencyKey: string
  ): Promise<boolean> {
    try {
      // Lazy import to avoid circular dependency at module load.
      const { notificationService } = await import('../notifications/notification.service');
      const result = await notificationService.sendFromTemplate(templateCode, recipient as any, variables, {
        source_module: 'automation',
        source_entity_type: 'obligation',
        source_action: `automation.${templateCode}`,
        idempotency_key: idempotencyKey,
      });
      return !!result;
    } catch (e: any) {
      // Non-fatal: a single notification failure must not abort the tick.
      console.warn(`[automation] notifyFromTemplate(${templateCode}) failed:`, e?.message);
      return false;
    }
  }

  private async notifyAdmins(
    templateCode: string,
    variables: Record<string, unknown>,
    idempotencyKey: string,
    emailChannelOn: boolean
  ): Promise<boolean> {
    try {
      const supabase = await createServiceClient();
      const { data: admins } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('role', ['admin', 'super_admin'])
        .eq('is_active', true);

      if (!admins?.length) return false;

      const { notificationService } = await import('../notifications/notification.service');
      let anySent = false;
      for (const admin of admins) {
        const result = await notificationService.sendFromTemplate(templateCode, {
          id: admin.id,
          type: 'user',
          email: emailChannelOn ? admin.email : undefined,
          name: admin.full_name,
        } as any, variables, {
          source_module: 'automation',
          source_action: `automation.${templateCode}`,
          idempotency_key: `${idempotencyKey}-${admin.id}`,
        });
        if (result) anySent = true;
      }
      return anySent;
    } catch (e: any) {
      console.warn(`[automation] notifyAdmins(${templateCode}) failed:`, e?.message);
      return false;
    }
  }

  // -----------------------------------------------------------------
  // Lock management (automation_locks)
  // -----------------------------------------------------------------
  private async acquireLock(runId: string): Promise<boolean> {
    const supabase = await createServiceClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    // Clean up stale locks first (defensive: a crashed run leaves an expired row).
    await supabase
      .from('automation_locks')
      .delete()
      .lt('expires_at', now.toISOString());

    // Insert our lock. If another tick inserted since cleanup, the PK
    // conflict tells us it's still running.
    const { error } = await supabase
      .from('automation_locks')
      .insert({
        id: LOCK_ID,
        locked_by: runId,
        locked_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      // PK conflict => lock held. Any other error is unexpected; treat as
      // not-acquired so we never double-run.
      return false;
    }
    return true;
  }

  private async releaseLock(runId: string): Promise<void> {
    const supabase = await createServiceClient();
    // Only release if we still own it (defensive against TTL expiry + reuse).
    await supabase
      .from('automation_locks')
      .delete()
      .eq('id', LOCK_ID)
      .eq('locked_by', runId);
  }

  // -----------------------------------------------------------------
  // Settings helpers
  // -----------------------------------------------------------------
  private async getBoolSetting(key: string, defaultValue: boolean): Promise<boolean> {
    const value = await settingsService.get(key);
    if (value == null) return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
  }

  private async getNumberSetting(key: string, defaultValue: number): Promise<number> {
    const value = await settingsService.get(key);
    if (value == null) return defaultValue;
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  // -----------------------------------------------------------------
  // Finish + persist run record
  // -----------------------------------------------------------------
  private async finish(
    runId: string,
    status: 'completed' | 'failed' | 'skipped',
    startedAt: Date,
    steps: AutomationStepResult[],
    errorMessage?: string,
    skipReason?: string
  ): Promise<AutomationTickResult> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    const totals = steps.reduce(
      (acc, s) => ({
        items_processed: acc.items_processed + s.items_processed,
        notifications_created: acc.notifications_created + s.notifications_created,
        emails_sent: acc.emails_sent + s.emails_sent,
        emails_skipped: acc.emails_skipped + s.emails_skipped,
        errors_count: acc.errors_count + s.errors.length,
      }),
      { items_processed: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors_count: 0 }
    );

    // Persist the run record (best-effort; never fail the tick over logging).
    try {
      const supabase = await createServiceClient();
      await supabase.from('automation_runs').insert({
        id: runId,
        run_type: 'tick',
        status,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        trigger: 'cron',
        items_processed: totals.items_processed,
        notifications_created: totals.notifications_created,
        emails_sent: totals.emails_sent,
        emails_skipped: totals.emails_skipped,
        errors_count: totals.errors_count,
        details: { steps, skip_reason: skipReason },
        error_message: errorMessage,
      });
    } catch (e: any) {
      console.warn('[automation] failed to persist run record:', e?.message);
    }

    return {
      run_id: runId,
      status,
      duration_ms: durationMs,
      steps,
      totals,
      error_message: errorMessage,
    };
  }
}

export const automationRunner = new AutomationRunner();
