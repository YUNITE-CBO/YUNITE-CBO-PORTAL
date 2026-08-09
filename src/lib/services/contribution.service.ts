/**
 * Contribution Service — thin orchestration over the Transaction Engine.
 *
 * Campaigns are domain records; contribution ledger balances are derived
 * from the transactions table by the engine. This service keeps campaign
 * totals consistent with the (non-reversed) ledger rather than recomputing
 * them in multiple places (a bug in the legacy routes).
 */

import { createServiceClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api/error';
import { transactionEngine, type TransactionType } from './transaction.engine';
import { v4 as uuidv4 } from 'uuid';

export interface CampaignInput {
  campaign_name: string;
  description?: string;
  target_amount?: number;
  start_date: string;
  end_date?: string;
}

export interface ContributionInput {
  member_id: string;
  campaign_id: string;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  reference?: string;
  notes?: string;
  contribution_type?: TransactionType; // defaults to contribution_monthly
}

export class ContributionService {
  async listCampaigns() {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.from('contribution_campaigns').select('*').order('created_at', { ascending: false });
    if (error) throw ApiError.server(error.message);
    return data ?? [];
  }

  async createCampaign(input: CampaignInput, userId: string) {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('contribution_campaigns')
      .insert({
        id: uuidv4(),
        campaign_name: input.campaign_name,
        description: input.description ?? null,
        target_amount: input.target_amount ?? null,
        start_date: input.start_date,
        end_date: input.end_date ?? null,
        created_by: userId,
        total_collected: 0,
      })
      .select()
      .single();
    if (error) throw ApiError.server(error.message);
    return data;
  }

  async listContributions(campaignId?: string) {
    const supabase = await createServiceClient();
    let q = supabase
      .from('transactions')
      .select('id, transaction_ref, member_id, amount, transaction_type, description, reference_number, metadata, posted_at, created_at, member:members(id, member_number, first_name, last_name)')
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .eq('reversed', false);
    if (campaignId) q = q.eq('metadata->>campaign_id', campaignId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw ApiError.server(error.message);
    return data ?? [];
  }

  async recordContribution(input: ContributionInput, userId: string) {
    const supabase = await createServiceClient();
    const { data: campaign } = await supabase
      .from('contribution_campaigns')
      .select('id')
      .eq('id', input.campaign_id)
      .maybeSingle();
    if (!campaign) throw ApiError.notFound('Campaign not found');

    // Ledger movement delegated to the authoritative Transaction Engine.
    const result = await transactionEngine.execute({
      member_id: input.member_id,
      account_type: 'contributions',
      transaction_type: input.contribution_type ?? 'contribution_monthly',
      amount: input.amount,
      description: input.notes ?? 'Contribution',
      reference_number: input.reference,
      user_id: userId,
      metadata: {
        campaign_id: input.campaign_id,
        payment_method: input.payment_method,
        payment_date: input.payment_date,
      },
    });

    // Recompute campaign total from the ledger (single source of truth).
    await this.recomputeCampaignTotal(input.campaign_id);

    try {
      await supabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'contributions.create',
        record_id: input.campaign_id,
        user_id: userId,
        after_value: { amount: input.amount, member_id: input.member_id },
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[contribution-service] audit insert failed:', e instanceof Error ? e.message : e);
    }

    return result;
  }

  /** Recompute a campaign's total from non-reversed contribution transactions. */
  async recomputeCampaignTotal(campaignId: string) {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .in('transaction_type', ['contribution_monthly', 'contribution_special', 'contribution_development'])
      .eq('reversed', false)
      .eq('metadata->>campaign_id', campaignId);
    if (error) throw ApiError.server(error.message);
    const total = (data ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
    const { error: updErr } = await supabase
      .from('contribution_campaigns')
      .update({ total_collected: total })
      .eq('id', campaignId);
    if (updErr) console.warn('[contribution-service] total update failed:', updErr.message);
    return total;
  }
}

export const contributionService = new ContributionService();
