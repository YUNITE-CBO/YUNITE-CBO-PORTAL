'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * YUNITE Transactions — controlled financial posting.
 *
 * The old free-form "Transaction Type + Account Type" form is replaced by a
 * guided 5-step workflow driven by the Transaction Rules Engine
 * (/api/transactions/rules). The system decides how an event is accounted for
 * (spec §17): the user answers "what happened?", the system exposes only valid
 * sub-types and automatically selects the valid ledger, then shows the
 * financial effect before a review screen.
 */

// ---------------------------------------------------------------------------
// Types (mirror the backend rules-engine metadata)
// ---------------------------------------------------------------------------
interface SubTypeMeta { code: string; label: string; prompt: string; }
interface CategoryMeta { code: string; label: string; subTypes: SubTypeMeta[]; }
interface LedgerMeta { code: string; label: string; nature: string; description: string; }
interface RuleMeta {
  category: string; subType: string; label: string;
  ledgers: string[]; defaultLedger: string;
}
interface RulesData {
  version: string;
  categories: CategoryMeta[];
  ledgers: LedgerMeta[];
  rules: RuleMeta[];
}

interface Member {
  id: string; member_number: string; first_name: string; last_name: string;
  phone: string; status: string;
}

interface TransactionRow {
  id: string;
  transaction_number?: string;
  transaction_ref: string;
  member_id: string;
  member?: { first_name: string; last_name: string; member_number: string } | null;
  txn_category?: string;
  txn_subtype?: string;
  ledger?: string;
  categoryLabel?: string;
  subTypeLabel?: string;
  ledgerLabel?: string;
  amount: number;
  payment_method?: string;
  reference_number?: string | null;
  description?: string | null;
  status: string;
  reversed: boolean;
  created_at: string;
  transaction_date?: string;
  posted_by?: string;
}

interface EffectInfo {
  memberSavingsEffect?: string;
  shareBalanceEffect?: string;
  loanBalanceEffect?: string;
  welfareBalanceEffect?: string;
  contributionBalanceEffect?: string;
  finesBalanceEffect?: string;
  organizationIncomeEffect?: string;
  organizationExpenseEffect?: string;
  explanation?: string;
}

// ---------------------------------------------------------------------------
// Shared client components
// ---------------------------------------------------------------------------
function EffectLine({ label, effect }: { label: string; effect?: string }) {
  const isChange = effect && effect !== 'no_change';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${isChange ? (effect === 'increase' ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
        {isChange ? (effect === 'increase' ? '+ Increase' : '− Decrease') : 'No change'}
      </span>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'red' | 'gray' | 'amber' }) {
  const tones = {
    green: 'bg-green-100 text-green-700 border-green-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const PAYMENT_METHODS = [
  { value: 'M_PESA', label: 'M-PESA' },
  { value: 'BANK', label: 'Bank' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other approved method' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 text-right">{children}</span>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  posted: 'Posted', reversed: 'Reversed', voided: 'Voided',
  draft: 'Draft', pending_review: 'Pending Review', failed: 'Failed',
};

// ---------------------------------------------------------------------------
// The Post-New-Transaction stepper
// ---------------------------------------------------------------------------
function TransactionPoster({ rulesData, onPosted }: { rulesData: RulesData; onPosted: () => void }) {
  const steps = ['Member', 'Transaction', 'Payment', 'Review', 'Posted'];
  const [step, setStep] = useState(0);

  // Step 1 — member
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [isOrgTransaction, setIsOrgTransaction] = useState(false);

  // Step 2 — what happened
  const [category, setCategory] = useState('');
  const [subType, setSubType] = useState('');
  const [ledger, setLedger] = useState('');

  // Step 3 — payment
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('M_PESA');
  const [reference, setReference] = useState('');
  const [txDate, setTxDate] = useState('');
  const [description, setDescription] = useState('');

  // Feedback
  const [preview, setPreview] = useState<EffectInfo | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [ruleValidation, setRuleValidation] = useState<{ expectedLedger: string } | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postedTx, setPostedTx] = useState<TransactionRow | null>(null);

  const categoryMeta = useMemo(() => rulesData.categories.find((c) => c.code === category), [rulesData, category]);

  const effectiveLedgers = useMemo(() => {
    if (!category || !subType) return [] as string[];
    const rule = rulesData.rules.find((r) => r.category === category && r.subType === subType);
    return rule ? rule.ledgers : [];
  }, [rulesData, category, subType]);

  const autoSelectedSingle = useMemo(() => effectiveLedgers.length === 1, [effectiveLedgers]);

  const autoDescription = useMemo(() => {
    const cat = rulesData.categories.find((c) => c.code === category)?.label ?? '';
    const sub = categoryMeta?.subTypes.find((s) => s.code === subType)?.label ?? '';
    return [sub || cat, member ? `— ${member.first_name} ${member.last_name}` : ''].filter(Boolean).join(' ');
  }, [category, categoryMeta, subType, member]);

  useEffect(() => {
    if (autoSelectedSingle) setLedger(effectiveLedgers[0]);
  }, [autoSelectedSingle, effectiveLedgers]);

  useEffect(() => {
    if (autoDescription && !description) setDescription(autoDescription);
  }, [autoDescription, description]);

  const searchMembers = async () => {
    if (!memberSearch.trim()) return;
    setMemberLoading(true);
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(memberSearch.trim())}&limit=8`);
      const data = await res.json();
      if (data.success) setMemberResults(data.data || []);
      else setMemberResults([]);
    } catch {
      setMemberResults([]);
    } finally {
      setMemberLoading(false);
    }
  };

  const selectMember = (m: Member) => {
    setMember(m);
    setIsOrgTransaction(false);
    setMemberResults([]);
    setMemberSearch('');
  };

  const runPreview = useCallback(async () => {
    setValidationMsg(null);
    setRuleValidation(null);
    setPreview(null);
    if (!category || !subType || !ledger) return;
    try {
      const res = await fetch('/api/transactions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, sub_type: subType, ledger }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data.effect);
      } else {
        setValidationMsg(data.error || 'Invalid combination');
        setRuleValidation(data.validation || null);
      }
    } catch {
      setValidationMsg('Could not validate this combination.');
    }
  }, [category, subType, ledger]);

  useEffect(() => {
    if (step === 3 && category && subType && ledger) runPreview();
  }, [step, category, subType, ledger, runPreview]);

  const goToReview = () => {
    setPostError(null);
    setDuplicateWarning(null);
    setConfirmDuplicate(false);
    if (!amount || Number(amount) <= 0) { setValidationMsg('Amount must be positive.'); return; }
    if (!member && !isOrgTransaction) { setValidationMsg('Select a member or choose Organization Transaction.'); return; }
    if (category && subType && ledger) runPreview();
    setStep(3);
  };

  const submitPost = async () => {
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          category,
          sub_type: subType,
          ledger,
          amount: Number(amount),
          payment_method: paymentMethod,
          reference_number: reference || undefined,
          transaction_date: txDate || undefined,
          description: description || undefined,
          confirm_duplicate: confirmDuplicate,
          is_org: isOrgTransaction,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.warning) {
        setDuplicateWarning(data.warning);
        setPosting(false);
        return;
      }
      if (!data.success) {
        setPostError(data.error || 'Posting failed');
        setPosting(false);
        return;
      }
      setPostedTx(data.data.transaction ?? data.data);
      setStep(4);
      onPosted();
    } catch {
      setPostError('Network error — try again.');
      setPosting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setMember(null); setCategory(''); setSubType(''); setLedger('');
    setAmount(''); setPaymentMethod('M_PESA'); setReference(''); setTxDate('');
    setDescription(''); setPreview(null); setValidationMsg(null); setRuleValidation(null);
    setConfirmDuplicate(false); setDuplicateWarning(null); setPostError(null); setPostedTx(null);
    setMemberSearch(''); setMemberResults([]); setIsOrgTransaction(false);
  };

  const selectedCatLabel = rulesData.categories.find((c) => c.code === category)?.label;
  const selectedSubLabel = categoryMeta?.subTypes.find((s) => s.code === subType)?.label;
  const selectedLedgerLabel = rulesData.ledgers.find((l) => l.code === ledger)?.label;

  if (step === 4) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="text-center py-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✓</div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">Transaction Posted</h3>
          <p className="text-gray-500 mt-1">The financial record has been written and the audit trail captured.</p>
        </div>
        <div className="max-w-md mx-auto bg-gray-50 rounded-lg p-5 space-y-2 text-sm">
          <Row label="Transaction ID">{postedTx?.transaction_ref ?? '—'}</Row>
          <Row label="Amount">
            <span className="font-semibold text-gray-900">KES {Number(postedTx?.amount ?? 0).toLocaleString()}</span>
          </Row>
          <Row label="Type">{selectedSubLabel || selectedCatLabel}</Row>
          <Row label="Ledger">{selectedLedgerLabel || ledger}</Row>
          {member && <Row label="Member">{member.first_name} {member.last_name}</Row>}
        </div>
        <div className="flex justify-center gap-3 mt-5">
          <button onClick={reset} className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Post Another Transaction
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      {/* Stepper header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center gap-1 sm:gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-indigo-600' : 'text-gray-400'}`}>
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium hidden sm:inline">{s}</span>
              </div>
              {i < steps.length - 1 && <span className="h-px w-5 bg-gray-300" />}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {postError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{postError}</div>
        )}

        {/* STEP 1 — MEMBER */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">1. Select Member</h3>
              <p className="text-sm text-gray-500">Search by member number, full name, or phone.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchMembers()}
                placeholder="Search members..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button onClick={searchMembers} disabled={memberLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {memberLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            {memberResults.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-auto">
                {memberResults.map((m) => (
                  <button key={m.id} type="button" onClick={() => selectMember(m)}
                    className="w-full px-4 py-2.5 text-left hover:bg-indigo-50">
                    <div className="font-medium">{m.first_name} {m.last_name}</div>
                    <div className="text-xs text-gray-500">{m.member_number} • {m.phone} • <span className="capitalize">{m.status}</span></div>
                  </button>
                ))}
              </div>
            )}
            {!member && (
              <div className="p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-2">Organization-level transaction?</p>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={isOrgTransaction}
                    onChange={(e) => { setIsOrgTransaction(e.target.checked); if (e.target.checked) setMember(null); }} />
                  This is an organization transaction (no individual member)
                </label>
                {isOrgTransaction && (
                  <p className="text-xs text-gray-500 mt-1">Donations, grants, and expenses don't belong to a member — the system accounts them to the organization ledger.</p>
                )}
              </div>
            )}
            {member && (
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-indigo-900">{member.first_name} {member.last_name}</p>
                    <p className="text-sm text-indigo-600">{member.member_number} • {member.phone} • <span className="capitalize">{member.status}</span></p>
                  </div>
                  <button onClick={() => setMember(null)} className="text-indigo-600 hover:text-indigo-800">✕</button>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <button onClick={() => { setValidationMsg(null); setStep(1); }} disabled={!member && !isOrgTransaction}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — WHAT HAPPENED (type → sub-type → ledger) */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">2. What happened?</h3>
              <p className="text-sm text-gray-500">Describe the financial event — the system determines how it is accounted for.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
              <p className="text-xs text-gray-400 mb-2">What happened to the money?</p>
              <select value={category}
                onChange={(e) => { setCategory(e.target.value); setSubType(''); setLedger(''); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select transaction type…</option>
                {rulesData.categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>

            {category && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {categoryMeta?.label === 'Fee' ? 'Fee Type' : `${categoryMeta?.label ?? 'Sub'} Type`} *
                </label>
                <p className="text-xs text-gray-400 mb-2">What specifically was it?</p>
                <select value={subType}
                  onChange={(e) => { setSubType(e.target.value); setLedger(''); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="">Select {categoryMeta?.label.toLowerCase()}…</option>
                  {categoryMeta?.subTypes.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
            )}

            {subType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account / Ledger *</label>
                <p className="text-xs text-gray-400 mb-2">Where should this transaction be recorded?</p>
                <div className={`${autoSelectedSingle && effectiveLedgers.length === 1 ? 'opacity-80' : ''}`}>
                  <select value={ledger} disabled={autoSelectedSingle && effectiveLedgers.length === 1}
                    onChange={(e) => setLedger(e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${autoSelectedSingle && effectiveLedgers.length === 1 ? 'bg-gray-50 text-gray-600' : ''}`}>
                    {effectiveLedgers.length === 0 && <option value="">Select ledger…</option>}
                    {effectiveLedgers.map((l) => (
                      <option key={l} value={l}>{rulesData.ledgers.find((x) => x.code === l)?.label ?? l}</option>
                    ))}
                  </select>
                </div>
                {autoSelectedSingle && effectiveLedgers.length === 1 && (
                  <p className="text-xs text-green-600 mt-1">✓ Automatically determined by the rules engine.</p>
                )}
                {effectiveLedgers.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">No valid ledger for this selection.</p>
                )}
              </div>
            )}

            {category && subType && ledger && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                <span>✓</span> Valid transaction • Valid ledger
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(0)} className="px-5 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">← Back</button>
              <button onClick={() => setStep(2)} disabled={!category || !subType || !ledger}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — PAYMENT / DETAILS */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">3. Payment &amp; Details</h3>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
              <input type="number" value={amount} min={0} step="0.01"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. M-PESA transaction ID or bank reference"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Date</label>
              <input type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              {autoDescription && <p className="text-xs text-gray-400 mt-1">Suggested: <span className="text-gray-600">{autoDescription}</span></p>}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="px-5 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">← Back</button>
              <button onClick={goToReview} disabled={!amount || Number(amount) <= 0}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                Review Transaction →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — REVIEW */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Review Transaction</h3>
              <p className="text-sm text-gray-500">Confirm the details before posting.</p>
            </div>

            {validationMsg && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                {validationMsg}
                {ruleValidation?.expectedLedger && (
                  <div className="mt-1 text-xs">
                    Expected ledger: {rulesData.ledgers.find((l) => l.code === ruleValidation.expectedLedger)?.label ?? ruleValidation.expectedLedger}
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <Row label="Member">{isOrgTransaction ? 'Organization' : member ? `${member.first_name} ${member.last_name}` : '—'}</Row>
              <Row label="Type">{selectedCatLabel}</Row>
              <Row label="Sub-Type">{selectedSubLabel}</Row>
              <Row label="Account / Ledger">{selectedLedgerLabel}</Row>
              <Row label="Amount"><span className="font-semibold">KES {Number(amount).toLocaleString()}</span></Row>
              <Row label="Payment Method">{PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.label}</Row>
              <Row label="Reference">{reference || '—'}</Row>
              <Row label="Description">{description || '—'}</Row>
            </div>

            {/* Financial Effect */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Financial Effect</h4>
              <p className="text-xs text-gray-500 mb-2">Shows which member and organization balances will change.</p>
              {preview ? (
                <div className="bg-white border rounded-lg p-4 space-y-1.5">
                  <EffectLine label="Member Savings" effect={preview.memberSavingsEffect} />
                  <EffectLine label="Share Balance" effect={preview.shareBalanceEffect} />
                  <EffectLine label="Loan Balance" effect={preview.loanBalanceEffect} />
                  <EffectLine label="Welfare Balance" effect={preview.welfareBalanceEffect} />
                  <EffectLine label="Contribution Balance" effect={preview.contributionBalanceEffect} />
                  <EffectLine label="Fines &amp; Obligations" effect={preview.finesBalanceEffect} />
                  <EffectLine label="Organization Income (Unity Fund)" effect={preview.organizationIncomeEffect} />
                  <EffectLine label="Organization Expense" effect={preview.organizationExpenseEffect} />
                  {preview.explanation && (
                    <div className="pt-2 border-t border-gray-100 text-xs text-gray-600 italic">{preview.explanation}</div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Evaluating financial effect…</p>
              )}
            </div>

            {duplicateWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <p className="font-medium">⚠ Possible duplicate detected</p>
                <p>{duplicateWarning}</p>
                <label className="flex items-center gap-2 mt-2 text-xs">
                  <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
                  I confirm this is a legitimate transaction, not a duplicate.
                </label>
              </div>
            )}

            {validationMsg && <div className="text-xs text-amber-700">Fix the amount/member above before posting.</div>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="px-5 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">← Back &amp; Edit</button>
              <button onClick={submitPost} disabled={posting || !!validationMsg}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {posting ? <span className="animate-spin">⏳</span> : '✓'} Confirm &amp; Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function TransactionsPage() {
  const [rulesData, setRulesData] = useState<RulesData | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    search: '', category: '', sub_type: '', ledger: '',
    payment_method: '', status: '', page: 1,
  });
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [reverseTarget, setReverseTarget] = useState<TransactionRow | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [refetchTick, setRefetchTick] = useState(0);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions/rules');
      const data = await res.json();
      if (data.success) setRulesData(data.data);
      else setRulesError(data.error || 'Could not load rules');
    } catch {
      setRulesError('Could not load transaction rules.');
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (filters.category) p.set('category', filters.category);
    if (filters.sub_type) p.set('sub_type', filters.sub_type);
    if (filters.ledger) p.set('ledger', filters.ledger);
    if (filters.payment_method) p.set('payment_method', filters.payment_method);
    if (filters.status) p.set('status', filters.status);
    p.set('page', String(filters.page));
    p.set('limit', '25');
    return p.toString();
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/transactions?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRows(data.data || []);
        setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [qs, refetchTick]);

  const handleReverse = async () => {
    if (!reverseTarget || reverseReason.trim().length < 3) return;
    try {
      const res = await fetch('/api/transactions/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: reverseTarget.id, reason: reverseReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReverseTarget(null); setReverseReason('');
        setRefetchTick((t) => t + 1);
      } else {
        alert(data.error || 'Reverse failed');
      }
    } catch {
      alert('Reverse failed');
    }
  };

  const formatKES = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Controlled financial posting — describe the event, the system accounts for it.</p>
        </div>
      </div>

      {rulesError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          ⚠ {rulesError}
        </div>
      )}

      {rulesData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TransactionPoster rulesData={rulesData} onPosted={() => setRefetchTick((t) => t + 1)} />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-6 h-fit space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              <input
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                placeholder="Search by ref or transaction ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <select value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, sub_type: '', page: 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All transaction types</option>
                {rulesData.categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <select value={filters.sub_type}
                onChange={(e) => setFilters((f) => ({ ...f, sub_type: e.target.value, page: 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All sub-types</option>
                {(rulesData.categories.find((c) => c.code === filters.category)?.subTypes ?? []).map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
              <select value={filters.ledger}
                onChange={(e) => setFilters((f) => ({ ...f, ledger: e.target.value, page: 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All ledgers</option>
                {rulesData.ledgers.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <select value={filters.payment_method}
                onChange={(e) => setFilters((f) => ({ ...f, payment_method: e.target.value, page: 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All payment methods</option>
                {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABEL).map(([s, lbl]) => <option key={s} value={s}>{lbl}</option>)}
              </select>
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{pagination.total}</span> transactions
              </div>
            </div>
          </div>

          {/* Recent transactions table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
              <button onClick={() => setRefetchTick((t) => t + 1)}
                className="text-sm text-indigo-600 hover:text-indigo-800">🔄 Refresh</button>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-500">Loading transactions…</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <span className="text-4xl">📋</span>
                <p className="mt-2">No transactions match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Transaction</th>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Ledger</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(tx.transaction_date || tx.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{tx.transaction_number || tx.transaction_ref}</div>
                          <div className="text-xs text-gray-400">{tx.transaction_ref}</div>
                        </td>
                        <td className="px-4 py-3">
                          {tx.member ? `${tx.member.first_name} ${tx.member.last_name}` : '—'}
                          {tx.member && <div className="text-xs text-gray-400">{tx.member.member_number}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{tx.subTypeLabel || tx.txn_subtype || '—'}</div>
                          <div className="text-xs text-gray-400">{tx.categoryLabel || tx.txn_category}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{tx.ledgerLabel || tx.ledger || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatKES(Number(tx.amount))}</td>
                        <td className="px-4 py-3">{PAYMENT_METHODS.find((p) => p.value === tx.payment_method)?.label || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={(tx.reversed || tx.status === 'reversed' || tx.status === 'voided') ? 'red' : (tx.status === 'pending_review' ? 'amber' : 'green')}>
                            {STATUS_LABEL[tx.status || 'posted']}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!tx.reversed && tx.status !== 'voided' && tx.status !== 'reversed' ? (
                            <button onClick={() => { setReverseTarget(tx); setReverseReason(''); }}
                              className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                              title="Reverse transaction">↩️ Reverse</button>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-3 border-t flex items-center justify-between text-sm">
                <span className="text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
                <div className="flex gap-2">
                  <button disabled={pagination.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                    className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
                  <button disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                    className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Reverse modal */}
      {reverseTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reverse Transaction</h3>
            <p className="text-sm text-gray-500 mb-4">
              {reverseTarget.transaction_ref} — {formatKES(Number(reverseTarget.amount))}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} rows={3}
              placeholder="Why is this being reversed?" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setReverseTarget(null)} className="px-4 py-2 bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleReverse} disabled={reverseReason.trim().length < 3}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">Reverse</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}