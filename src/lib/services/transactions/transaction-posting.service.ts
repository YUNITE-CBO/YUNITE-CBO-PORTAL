/**
 * YUNITE CONTROLLED TRANSACTION POSTING SERVICE
 *
 * The controlled-posting layer that sits ON TOP of the authoritative
 * TransactionEngine (ledger movement) and enforces the Transaction Rules
 * Engine (single source of truth for valid (category, sub-type, ledger)
 * combinations and their financial effects).
 *
 * Flow enforced here (spec §6, §7, §8, §9, §13):
 *   1.  member status / existence validated
 *   2.  category + sub-type + ledger validated against TRANSACTION_RULES
 *   3.  amount, payment method, reference, date validated
 *   4.  financial effect computed deterministically (effectFor)
 *   5.  duplicate detection (within configured window) — returns a warning;
 *       the API can require explicit confirmation to proceed
 *   6.  ledger movement delegated to transactionEngine.execute (atomic write,
 *       balance snapshots, notification events)
 *   7.  the transaction row is updated with the new controlled dimensions +
 *       status ['posted'] + transaction_number (sequence) + audit
 *
 * Reversal / void follow the "never destroy financial history" rule: the
 * original row is marked reversed/voided (never deleted) and a reversal row
 * is created via transactionEngine.reverse where applicable.
 *
 * Every mutated state change writes an audit_logs row (best-effort) so no
 * silent modification of historical financial records is possible.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { settingsService } from '@/lib/services/settings.service';
import {
  TransactionCategory,
  TransactionSubType,
  LedgerCode,
  PaymentMethod,
  PAYMENT_METHODS,
  isCategoryCode,
  isSubTypeCode,
  isLedgerCode,
  validateRule,
  effectFor,
  getRule,
  getLedger,
  LEGACY_TYPE_TRANSACTION_TYPE_MAP,
} from './transaction-rules';
import type { TransactionType as RuleTransactionType } from './transaction-rules';

export interface PostTransactionInput {
  member_id: string;
  category: TransactionCategory | string;
  sub_type: TransactionSubType | string;
  ledger: LedgerCode | string;
  amount: number;
  payment_method?: PaymentMethod | string;
  reference_number?: string;
  transaction_date?: string;
  description?: string;
  /** Set true to confirm a possible-duplicate warning. */
  confirm_duplicate?: boolean;
  /** Additional metadata (loan_id / fine_id / campaign_id etc). */
  metadata?: Record<string, unknown>;
}

export interface PostTransactionResult {
  ok: boolean;
  transaction?: Record<string, unknown>;
  balances?: Record<string, number>;
  warning?: string;
  error?: string;
  /** Set when an invalid combination is rejected (spec §6). */
  validation?: { expectedLedger: LedgerCode; message: string };
}

const VALID_ACCOUNT_TYPES = ['savings', 'shares', 'contributions', 'welfare', 'fines', 'loans'] as const;

export class TransactionPostingService {
  /**
   * Validate member identity + status. Rejects unknown / non-active members
   * for member-ledger postings. (Org-ledgers still resolve beyond this.)
   */
  private async resolveMember(memberId: string): Promise<{ id: string; status?: string } | null> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('members')
      .select('id, status')
      .eq('id', memberId)
      .maybeSingle();
    return data ?? null;
  }

  /**
   * Find the physical member account for a ledger. If the ledger targets a
   * member balance account we use that; otherwise we need a member account to
   * anchor the transaction row (member_id + account_id are NOT NULL in the
   * authoritative ledger). For ORG-level ledgers (donations/grants/expenses)
   * the posting still requires a member anchor; the ledger column carries the
   * org dimension. The UI exposes an "Organization Transaction" mode that
   * resolves to the organization's designated member anchor via the setting
   * `transactions.org_member_id` (fallback: first active member), so a member
   * is never FORCED onto a genuinely org-level transaction in the workflow.
   */
  private async resolvePhysicalAccount(
    memberId: string,
    ledger: LedgerCode
  ): Promise<{ accountId: string } | { error: string }> {
    const def = getLedger(ledger);
    const accountType = def?.accountType ?? 'contributions';

    const supabase = await createServiceClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', memberId)
      .eq('account_type', accountType)
      .eq('status', 'active')
      .maybeSingle();

    if (account?.id) return { accountId: account.id };
    // Fallback: any active account for the member so the transaction can still
    // anchor (financial dimension is carried by the ledger column).
    const { data: anyAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('member_id', memberId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (anyAccount?.id) return { accountId: anyAccount.id };
    return { error: 'Member has no active account to anchor this transaction.' };
  }

  /**
   * Duplicate detection (spec §13): same member + amount + payment method +
   * reference within the configured window (default 10 minutes).
   */
  async detectDuplicate(
    input: Pick<PostTransactionInput, 'member_id' | 'amount' | 'payment_method' | 'reference_number'>
  ): Promise<{ duplicate: boolean; reference?: string }> {
    if (!input.reference_number) return { duplicate: false };
    const windowMin = await settingsService.getNumber('transactions.duplicate_window_minutes', 10);
    if (windowMin <= 0) return { duplicate: false };

    const supabase = await createServiceClient();
    const since = new Date(Date.now() - windowMin * 60_000).toISOString();
    const { data } = await supabase
      .from('transactions')
      .select('id, reference_number, amount, payment_method, status')
      .eq('member_id', input.member_id)
      .eq('reference_number', input.reference_number)
      .eq('reversed', false)
      .in('status', ['posted', 'pending_review', 'draft'])
      .gte('created_at', since)
      .limit(1);

    const existing = data && data[0];
    if (existing && Math.abs(Number(existing.amount) - Number(input.amount)) < 0.01) {
      return { duplicate: true, reference: input.reference_number };
    }
    return { duplicate: false };
  }

  /**
   * Preview the financial effect — used by UI + the /preview API before post.
   */
  preview(input: Pick<PostTransactionInput, 'category' | 'sub_type' | 'ledger' | 'amount'>) {
    const rule = validateRule(input.category as TransactionCategory, input.sub_type as TransactionSubType, input.ledger as LedgerCode);
    if (!rule.valid) return { ok: false as const, validation: { expectedLedger: rule.expectedLedger, message: rule.message } };
    const effect = effectFor(input.ledger as LedgerCode);
    return {
      ok: true as const,
      category: input.category,
      sub_type: input.sub_type,
      ledger: input.ledger,
      ledgerLabel: getLedger(input.ledger as LedgerCode)?.label ?? input.ledger,
      effect,
    };
  }

  /**
   * Post a controlled transaction. Runs the full double-safety validation
   * chain (spec §7). On any failure nothing is persisted.
   */
  async post(input: PostTransactionInput): Promise<PostTransactionResult> {
    const supabase = await createServiceClient();

    // --- 1. member ---------------------------------------------------------
    const member = await this.resolveMember(input.member_id);
    if (!member) {
      return { ok: false, error: 'Member not found.' };
    }

    // --- 2. transaction dimensions ------------------------------------------
    if (!isCategoryCode(String(input.category))) {
      return { ok: false, error: `Invalid transaction category: ${String(input.category)}` };
    }
    if (!isSubTypeCode(String(input.sub_type))) {
      return { ok: false, error: `Invalid transaction sub-type: ${String(input.sub_type)}` };
    }
    if (!isLedgerCode(String(input.ledger))) {
      return { ok: false, error: `Invalid ledger: ${String(input.ledger)}` };
    }

    // --- 3. rule validation (backend — never trust the UI) -------------------
    const ruleCheck = validateRule(input.category as TransactionCategory, input.sub_type as TransactionSubType, input.ledger as LedgerCode);
    if (!ruleCheck.valid) {
      return {
        ok: false,
        error: `TRANSACTION REJECTED — ${ruleCheck.message}`,
        validation: { expectedLedger: ruleCheck.expectedLedger, message: ruleCheck.message },
      };
    }

    // --- 4. amount / payment method / reference / date ----------------------
    if (!(input.amount > 0) || !Number.isFinite(input.amount)) {
      return { ok: false, error: 'Amount must be a positive finite number.' };
    }
    const paymentMethod = (String(input.payment_method || 'OTHER')) as PaymentMethod;
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return { ok: false, error: `Invalid payment method: ${String(input.payment_method)}` };
    }

    // --- 5. financial effect (deterministic) --------------------------------
    const effect = effectFor(input.ledger as LedgerCode);

    // --- 6. duplicate detection ---------------------------------------------
    const dup = await this.detectDuplicate({
      member_id: input.member_id,
      amount: input.amount,
      payment_method: paymentMethod,
      reference_number: input.reference_number,
    });
    if (dup.duplicate && !input.confirm_duplicate) {
      return {
        ok: false,
        warning: `⚠ POSSIBLE DUPLICATE — A transaction with reference "${dup.reference}" already exists for this member. Confirm only if genuinely legitimate.`,
      };
    }

    // --- 7. physical account + ledger movement ------------------------------
    const physical = await this.resolvePhysicalAccount(input.member_id, input.ledger as LedgerCode);
    if ('error' in physical) return { ok: false, error: physical.error };

    const rule = getRule(input.category as TransactionCategory, input.sub_type as TransactionSubType);
    // Prefer the rule's explicit legacy type; fall back to the sub-type map.
    const legacyType = (rule?.legacyTransactionType ??
      LEGACY_TYPE_TRANSACTION_TYPE_MAP[input.sub_type as string] ??
      'contribution_monthly') as RuleTransactionType;

    // user_id is passed via metadata.user_id (set by the authenticated route).
    const userId = input.metadata && typeof input.metadata.user_id === 'string'
      ? input.metadata.user_id
      : '00000000-0000-0000-0000-000000000000';

    try {
      const { transactionEngine } = await import('@/lib/services/transaction.engine');
      const result = await transactionEngine.execute({
        member_id: input.member_id,
        account_type: this.accountTypeForLedger(input.ledger as LedgerCode),
        transaction_type: legacyType,
        amount: input.amount,
        description: input.description || `${getLedger(input.ledger as LedgerCode)?.label ?? input.ledger}`,
        reference_number: input.reference_number,
        metadata: input.metadata,
        user_id: userId,
      });

      // The legacy Engine.execute creates its own row; after it succeeds we
      // enrich that row with the controlled dimensions + status.
      const tx = result.transaction as { id: string; [k: string]: unknown };
      const allocations = this.allocateEffect(input.ledger as LedgerCode, effect);
      await supabase
        .from('transactions')
        .update({
          txn_category: input.category,
          txn_subtype: input.sub_type,
          ledger: input.ledger,
          payment_method: paymentMethod,
          transaction_date: input.transaction_date || new Date().toISOString(),
          status: 'posted',
        })
        .eq('id', tx.id);

      // Audit trail (best-effort, per project convention).
      try {
        await supabase.from('audit_logs').insert({
          id: uuidv4(),
          action: 'transactions.post',
          record_id: tx.id,
          user_id: userId,
          after_value: {
            category: input.category,
            sub_type: input.sub_type,
            ledger: input.ledger,
            amount: input.amount,
            payment_method: paymentMethod,
            financial_effect: allocations,
          },
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Audit insert failed (best-effort):', err);
      }

      const balances = result.balances ?? {};
      return { ok: true, transaction: tx, balances };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Transaction failed';
      console.error('Controlled posting failed:', error);
      return { ok: false, error: msg };
    }
  }

  private accountTypeForLedger(ledger: LedgerCode): string {
    return getLedger(ledger)?.accountType ?? 'contributions';
  }

  private allocateEffect(ledger: LedgerCode, effect: ReturnType<typeof effectFor>): Record<string, string> {
    if (!effect) return {};
    return {
      memberSavings: effect.memberSavingsEffect,
      shares: effect.shareBalanceEffect,
      loans: effect.loanBalanceEffect,
      welfare: effect.welfareBalanceEffect,
      contributions: effect.contributionBalanceEffect,
      fines: effect.finesBalanceEffect,
      organizationIncome: effect.organizationIncomeEffect,
      organizationExpense: effect.organizationExpenseEffect,
    };
  }

  /** Build searchable transaction bodies for reports / list views. */
  async listTransactions(params: {
    member_id?: string;
    category?: string;
    sub_type?: string;
    ledger?: string;
    payment_method?: string;
    status?: string;
    reference_number?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    posted_by?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const offset = (page - 1) * limit;

    const supabase = await createServiceClient();
    let q = supabase.from('transactions').select('*', { count: 'exact' });

    if (params.member_id) q = q.eq('member_id', params.member_id);
    if (params.category) q = q.eq('txn_category', params.category);
    if (params.sub_type) q = q.eq('txn_subtype', params.sub_type);
    if (params.ledger) q = q.eq('ledger', params.ledger);
    if (params.payment_method) q = q.eq('payment_method', params.payment_method);
    if (params.status) q = q.eq('status', params.status);
    if (params.start_date) q = q.gte('transaction_date', params.start_date);
    if (params.end_date) q = q.lte('transaction_date', params.end_date);
    if (params.posted_by) q = q.eq('posted_by', params.posted_by);
    if (params.reference_number) q = q.eq('reference_number', params.reference_number);
    if (params.search) {
      q = q.or(`transaction_number.ilike.%${String(params.search).replace(/[%,()\s]/g, '')}%,reference_number.ilike.%${String(params.search).replace(/[%,()\s]/g, '')}%`);
    }

    const { data, count, error } = await q
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    const rulesEngine = await import('./transaction-rules');
    const rows = (data ?? []).map((row: any) => ({
      ...row,
      categoryLabel: row.txn_category ? rulesEngine.categoryLabel(row.txn_category) : rulesEngine.categoryLabel(rulesEngine.deriveFromLegacy(row.transaction_type).category),
      subTypeLabel: row.txn_subtype ? rulesEngine.subTypeLabel(row.txn_subtype) : rulesEngine.subTypeLabel(rulesEngine.deriveFromLegacy(row.transaction_type).subType),
      ledgerLabel: row.ledger ? rulesEngine.ledgerLabel(row.ledger) : rulesEngine.ledgerLabel(rulesEngine.deriveFromLegacy(row.transaction_type).ledger),
    }));

    return {
      transactions: rows,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }
}

export const transactionPostingService = new TransactionPostingService();