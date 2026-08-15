/**
 * AI ALERTING SERVICE.
 *
 * When an investigation discovers CRITICAL findings, raise an internal
 * YUNITE notification (and optionally enqueue an email) so admins learn
 * about it without watching the dashboard. Per the spec:
 *  - Create an internal YUNITE notification.
 *  - If configured, send an email notification.
 *  - Do NOT send sensitive financial information unnecessarily in email.
 *    The full evidence stays inside the Admin Console.
 *
 * Uses the EXISTING notificationService.sendFromTemplate + email_queue so we
 * do not duplicate the notification stack. Per-day idempotency prevents
 * repeat alerts for the same finding set.
 */

import { createServiceClient } from '@/lib/supabase/server';
import type { Finding } from './types';
import { isAiCriticalAlertsEnabled } from './settings';

const ADMIN_CRITICAL_TEMPLATE = 'admin.ai_critical_alert';

export async function alertCriticalFindings(
  investigationId: string,
  findings: Finding[],
): Promise<{ notified: number; skipped: number }> {
  const criticals = findings.filter((f) => f.severity === 'critical' && f.verification_status !== 'rejected');
  if (criticals.length === 0) return { notified: 0, skipped: 0 };

  // Honor the admin toggle (ai.alerts.critical_enabled). Default ON.
  if (!(await isAiCriticalAlertsEnabled())) {
    return { notified: 0, skipped: criticals.length };
  }

  const supabase = await createServiceClient();

  // Resolve admin + super_admin users to notify (in-app).
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'super_admin'])
    .eq('status', 'active');

  // Per-day idempotency: one alert per investigation per day.
  const idempotencyKey = `ai-critical-${investigationId}-${new Date().toISOString().slice(0, 10)}`;
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('metadata->>idempotency_key', idempotencyKey)
    .limit(1);
  if (existing && existing.length) {
    return { notified: 0, skipped: criticals.length };
  }

  // Intentionally does NOT include financial values — only the finding titles.
  const titles = criticals.slice(0, 10).map((f) => f.title);
  const subject = `YUNITE AI detected ${criticals.length} CRITICAL finding(s)`;
  const body = `Investigation ${investigationId} found ${criticals.length} critical consistency issue(s):\n\n${titles.join('\n')}\n\nReview the full evidence in the Admin Console → AI Intelligence.`;

  const recipientIds = (admins ?? []).map((a) => a.id);
  const rows = recipientIds.map((uid) => ({
    id: cryptoRandomUUID(),
    recipient_id: uid,
    recipient_type: 'user',
    subject,
    body,
    notification_type: 'ai_alert',
    category: 'ai',
    status: 'unread',
    related_entity_type: 'ai_investigation',
    related_entity_id: investigationId,
    metadata: { idempotency_key: idempotencyKey, severity: 'critical', finding_count: criticals.length },
    // legacy columns kept in sync (see migration 028 note in AGENTS.md)
    title: subject,
    message: body,
  }));

  let notified = 0;
  if (rows.length) {
    const { error } = await supabase.from('notifications').insert(rows);
    if (!error) notified = recipientIds.length;
  }

  // Best-effort email enqueue (no sensitive financial data in the body).
  try {
    await supabase.from('email_queue').insert({
      id: cryptoRandomUUID(),
      to_address: '', // resolved by notification processor to admin emails
      subject,
      body,
      status: 'pending',
      template_code: ADMIN_CRITICAL_TEMPLATE,
      template_data: { investigation_id: investigationId, finding_count: criticals.length, titles },
      metadata: { idempotency_key: idempotencyKey, source: 'ai_intelligence' },
    });
  } catch {
    // best-effort; email queue is optional
  }

  return { notified, skipped: 0 };
}

function cryptoRandomUUID(): string {
  // Avoid pulling the uuid dep into this module path; crypto.randomUUID is
  // available in Node 19+ and the edge runtime.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
