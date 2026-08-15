/**
 * Investigation tools barrel + payload builder.
 *
 * Assembles the read-only, PII-sanitized `tools_payload` for a given scope.
 * This payload is what both AI providers receive (identical input) AND what
 * the deterministic engines use (via the raw, un-sanitized getters where
 * needed). One data-gathering layer, not two.
 */

import { sanitizeForAi } from './sanitizer';
import type { InvestigationScope } from '../types';
import * as db from './database-tools';
import * as api from './api-tools';

export { sanitizeForAi } from './sanitizer';
export {
  KNOWN_TABLES, getDatabaseSchema, queryReadOnlyDatabase, getMemberRaw,
  getMemberFinancialsRaw, getSavingsTransactionsRaw, getSharesRaw, getLoansRaw,
  getLoanRepaymentsRaw, getContributionsRaw, getFinesRaw, getWelfareRaw,
  getOrganizationSettings, getBusinessRules, getAuditLogs, getModuleHealth,
  getDataAvailability, getMembersSampleRaw, computeLedgerSavings,
} from './database-tools';
export {
  getApiRoutes, inspectApiSurface, getApiResponseSchema, getApiDefinition,
  getApiActivity, type RouteInspection,
} from './api-tools';
export {
  getDatabaseBalances, getApiBalances, getDisplayBalances, getMemberIdentity,
  getDisplayIdentity, searchMembers, getMemberGraph, type LayerBalances,
} from './member-lookup-tools';

export { db, api };

/**
 * Build the sanitized tools payload for an investigation scope. For member
 * scopes, `memberId` scopes all queries. For non-member scopes a
 * representative aggregate snapshot is gathered (capped so the prompt stays
 * within token budgets).
 */
export async function buildToolsPayload(
  scope: InvestigationScope,
  memberId?: string,
): Promise<Record<string, unknown>> {
  // Run the connectivity probe once and merge it into every scope's payload so
  // the AI (and admin) can tell a COLLECTION FAILURE (auth/env/RLS) from a
  // genuine empty-organization state. Without this, silent empty arrays get
  // reported as "no member data" findings (see AUD-001 / DATA-001).
  const data_availability = await db.getDataAvailability();
  const mergeAvailability = (payload: Record<string, unknown>) => ({ ...payload, data_availability });

  switch (scope) {
    case 'database':
      return sanitizeForAi(mergeAvailability({
        schema: await db.getDatabaseSchema(),
        db_stats: await db.queryReadOnlyDatabase(),
        audit_logs_sample: await db.getAuditLogs(50),
        module_health: await db.getModuleHealth(),
      }));
    case 'api':
      return sanitizeForAi(mergeAvailability({
        api_definition: api.getApiDefinition(),
        api_activity: await api.getApiActivity(50),
      }));
    case 'business_rules':
      return sanitizeForAi(mergeAvailability({
        settings: await db.getOrganizationSettings(),
        business_rules: await db.getBusinessRules(),
      }));
    case 'financial':
      return sanitizeForAi(mergeAvailability({
        db_stats: await db.queryReadOnlyDatabase(),
        business_rules: await db.getBusinessRules(),
        loans: await db.getLoansRaw(),
        loan_repayments: await db.getLoanRepaymentsRaw(),
        fines: await db.getFinesRaw(),
        contributions: await db.getContributionsRaw(),
        welfare: await db.getWelfareRaw(),
      }));
    case 'cross_module': {
      // Cross-module needs a member sample to compare relationships. If a
      // member is provided, use it; otherwise pull a small member sample.
      const supabase = await (await import('@/lib/supabase/server')).createServiceClient();
      let memberIds: string[] = [];
      if (memberId) {
        memberIds = [memberId];
      } else {
        const { data: sample } = await supabase.from('members').select('id').eq('status', 'active').limit(5);
        memberIds = (sample ?? []).map((m) => m.id);
      }
      const perMember = await Promise.all(
        memberIds.map(async (id) => ({
          member_id: id,
          financials: await db.getMemberFinancialsRaw(id),
          savings_txns: await db.getSavingsTransactionsRaw(id, 50),
          loans: await db.getLoansRaw(id),
          fines: await db.getFinesRaw(id),
          contributions: await db.getContributionsRaw(id),
          welfare: await db.getWelfareRaw(id),
          shares: await db.getSharesRaw(id),
        })),
      );
      return sanitizeForAi(mergeAvailability({
        business_rules: await db.getBusinessRules(),
        members: perMember,
      }));
    }
    case 'member_verification': {
      if (!memberId) return { error: 'member_id required for member_verification scope' };
      return sanitizeForAi(mergeAvailability({
        member: await db.getMemberRaw(memberId),
        financials: await db.getMemberFinancialsRaw(memberId),
        savings_txns: await db.getSavingsTransactionsRaw(memberId, 100),
        loans: await db.getLoansRaw(memberId),
        fines: await db.getFinesRaw(memberId),
        contributions: await db.getContributionsRaw(memberId),
        welfare: await db.getWelfareRaw(memberId),
        shares: await db.getSharesRaw(memberId),
      }));
    }
    case 'full_system':
      // full_system previously had NO member-level data by design — the most
      // comprehensive scope omitted member profiles/accounts/transactions
      // entirely, so no per-member audit could run. A small active-member
      // sample (financials + loans + fines + contributions + welfare + shares)
      // is now included so the AI can audit real member financial graphs.
      return sanitizeForAi(mergeAvailability({
        schema: await db.getDatabaseSchema(),
        db_stats: await db.queryReadOnlyDatabase(),
        api_definition: api.getApiDefinition(),
        api_activity: await api.getApiActivity(30),
        settings: await db.getOrganizationSettings(),
        business_rules: await db.getBusinessRules(),
        loans: await db.getLoansRaw(),
        fines: await db.getFinesRaw(),
        contributions: await db.getContributionsRaw(),
        welfare: await db.getWelfareRaw(),
        members_sample: await db.getMembersSampleRaw(5),
        audit_logs_sample: await db.getAuditLogs(30),
        module_health: await db.getModuleHealth(),
      }));
    default:
      return mergeAvailability({});
  }
}
