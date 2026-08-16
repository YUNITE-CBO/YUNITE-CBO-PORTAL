'use client';

import { useEffect, useState } from 'react';

/**
 * Unity Fund dashboard page (spec §39, §43).
 *
 * The Unity Fund is the ORGANIZATION-level reserve — NOT a member account.
 * This page renders the authoritative position from UnityFundEngine via the
 * /api/v1/unity-fund/* endpoints, clearly separating:
 *   - Actual balance (real org cash)
 *   - Pending receivables (due but unpaid — NOT cash)
 *   - Organization liabilities (received org loans — cash AND a liability)
 *   - Reconciliation status (engine ledger vs DB view vs source sum)
 */

interface UnityFundSource {
  source: string;
  label: string;
  actual: number;
  pending: number;
  transaction_count: number;
}

interface UnityFundPosition {
  actual_balance: number;
  pending_receivables: number;
  total_receipts: number;
  total_expenditures: number;
  organization_liabilities: number;
  net_financial_position: number;
  currency: string;
  generated_at: string;
  sources: UnityFundSource[];
}

interface ExpenditureCategory {
  category: string;
  total: number;
  count: number;
}

interface ExpendituresResponse {
  total_expenditures: number;
  by_category: ExpenditureCategory[];
}

interface OrganizationLoan {
  org_loan_number: string;
  lender_name: string;
  received_amount: number;
  repaid_amount: number;
  outstanding_liability: number;
  status: string;
}

interface LiabilitiesResponse {
  total_organization_loans_received: number;
  total_organization_loans_repaid: number;
  outstanding_liabilities: number;
  loans: OrganizationLoan[];
}

interface ReconciliationCheck {
  label: string;
  expected: number;
  actual: number;
  difference: number;
  passed: boolean;
}

interface ReconciliationResponse {
  status: string;
  ledger_balance: number;
  source_balance: number;
  difference: number;
  checks: ReconciliationCheck[];
  discrepancies: Array<{ label: string; difference: number }>;
}

export default function UnityFundPage() {
  const [position, setPosition] = useState<UnityFundPosition | null>(null);
  const [expenditures, setExpenditures] = useState<ExpendituresResponse | null>(null);
  const [liabilities, setLiabilities] = useState<LiabilitiesResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [posRes, expRes, liaRes, recRes] = await Promise.all([
        fetch('/api/v1/unity-fund/summary'),
        fetch('/api/v1/unity-fund/expenditures'),
        fetch('/api/v1/unity-fund/liabilities'),
        fetch('/api/v1/unity-fund/reconciliation'),
      ]);
      if (!posRes.ok) throw new Error(`Failed to load Unity Fund summary (${posRes.status})`);
      const posJson = await posRes.json();
      setPosition(posJson.data ?? posJson);
      if (expRes.ok) {
        const j = await expRes.json();
        setExpenditures(j.data ?? j);
      }
      if (liaRes.ok) {
        const j = await liaRes.json();
        setLiabilities(j.data ?? j);
      }
      if (recRes.ok) {
        const j = await recRes.json();
        setReconciliation(j.data ?? j);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Unity Fund data');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (amount: number, currency = position?.currency || 'KES') =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount || 0);

  const statusColor = (status: string) =>
    status === 'consistent' ? 'bg-green-100 text-green-800 border-green-300'
    : status === 'discrepancy' ? 'bg-red-100 text-red-800 border-red-300'
    : 'bg-amber-100 text-amber-800 border-amber-300';

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Unity Fund</h1>
        <p className="text-gray-500 mt-1">Organization-level reserve: actual cash, pending receivables, expenditures, liabilities, and reconciliation.</p>
        <p className="text-xs text-amber-700 mt-2">
          ⚠ The Unity Fund is an <strong>organization account</strong>, not a member account. Pending receivables are
          <strong> NOT cash</strong> — they are amounts due but unpaid. A received organization loan is cash <strong>and</strong> a liability, never income.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-300 text-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading Unity Fund</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline">Retry</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">💵</div>
            <div>
              <p className="text-green-100 text-sm">Actual Balance</p>
              <p className="text-2xl font-bold">{fmt(position?.actual_balance || 0)}</p>
              <p className="text-green-100 text-xs mt-1">Real org cash</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">⏳</div>
            <div>
              <p className="text-amber-100 text-sm">Pending Receivables</p>
              <p className="text-2xl font-bold">{fmt(position?.pending_receivables || 0)}</p>
              <p className="text-amber-100 text-xs mt-1">Due but unpaid — NOT cash</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl">🏛️</div>
            <div>
              <p className="text-indigo-100 text-sm">Net Financial Position</p>
              <p className="text-2xl font-bold">{fmt(position?.net_financial_position || 0)}</p>
              <p className="text-indigo-100 text-xs mt-1">Actual cash − liabilities</p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Receipts" value={fmt(position?.total_receipts || 0)} accent="text-green-700" />
        <StatCard label="Total Expenditures" value={fmt(position?.total_expenditures || 0)} accent="text-red-700" />
        <StatCard label="Organization Liabilities" value={fmt(position?.organization_liabilities || 0)} accent="text-indigo-700" />
        <StatCard
          label="Reconciliation"
          value={reconciliation?.status?.toUpperCase() || '—'}
          accent={reconciliation?.status === 'consistent' ? 'text-green-700' : 'text-red-700'}
        />
      </div>

      {/* Sources */}
      <Section title="Actual vs Pending by Source">
        <p className="text-xs text-gray-500 mb-3">Pending amounts are receivables. They are never added to the actual balance.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4 text-right">Actual</th>
                <th className="py-2 pr-4 text-right">Pending</th>
                <th className="py-2 text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {position?.sources?.length ? (
                position.sources.map((s) => (
                  <tr key={s.source} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{s.label}</td>
                    <td className="py-2 pr-4 text-right font-medium text-green-700">{fmt(s.actual)}</td>
                    <td className="py-2 pr-4 text-right text-amber-700">{fmt(s.pending)}</td>
                    <td className="py-2 text-right text-gray-500">{s.transaction_count}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="py-4 text-center text-gray-400">No sources recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Expenditures */}
      <Section title="Expenditures by Category">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {expenditures?.by_category?.length ? (
                expenditures.by_category.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{c.category}</td>
                    <td className="py-2 pr-4 text-right font-medium text-red-700">{fmt(c.total)}</td>
                    <td className="py-2 text-right text-gray-500">{c.count}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={3} className="py-4 text-center text-gray-400">No posted expenditures</td></tr>
              )}
            </tbody>
            {expenditures && expenditures.by_category.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right text-red-700">{fmt(expenditures.total_expenditures)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Section>

      {/* Liabilities */}
      <Section title="Organization Loan Liabilities">
        <p className="text-xs text-gray-500 mb-3">A received organization loan is cash AND a liability. It is NEVER income or profit.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-4">Loan No.</th>
                <th className="py-2 pr-4">Lender</th>
                <th className="py-2 pr-4 text-right">Received</th>
                <th className="py-2 pr-4 text-right">Repaid</th>
                <th className="py-2 pr-4 text-right">Outstanding</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {liabilities?.loans?.length ? (
                liabilities.loans.map((l) => (
                  <tr key={l.org_loan_number} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{l.org_loan_number}</td>
                    <td className="py-2 pr-4">{l.lender_name}</td>
                    <td className="py-2 pr-4 text-right">{fmt(l.received_amount)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(l.repaid_amount)}</td>
                    <td className="py-2 pr-4 text-right font-medium text-indigo-700">{fmt(l.outstanding_liability)}</td>
                    <td className="py-2"><StatusPill status={l.status} /></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">No organization loans</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Reconciliation */}
      <Section title="Reconciliation">
        <div className="flex items-center gap-3 mb-3">
          <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${statusColor(reconciliation?.status || '')}`}>
            {reconciliation?.status?.toUpperCase() || 'UNKNOWN'}
          </span>
          <span className="text-sm text-gray-600">
            Difference: <strong className={reconciliation && reconciliation.difference !== 0 ? 'text-red-700' : 'text-green-700'}>
              {fmt(reconciliation?.difference || 0)}
            </strong>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-4">Check</th>
                <th className="py-2 pr-4 text-right">Expected</th>
                <th className="py-2 pr-4 text-right">Actual</th>
                <th className="py-2 pr-4 text-right">Difference</th>
                <th className="py-2 text-center">Passed</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation?.checks?.length ? (
                reconciliation.checks.map((c) => (
                  <tr key={c.label} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{c.label}</td>
                    <td className="py-2 pr-4 text-right">{fmt(c.expected)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(c.actual)}</td>
                    <td className={`py-2 pr-4 text-right ${c.difference !== 0 ? 'text-red-700 font-medium' : 'text-gray-500'}`}>{fmt(c.difference)}</td>
                    <td className="py-2 text-center">{c.passed ? '✓' : '✕'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="py-4 text-center text-gray-400">No reconciliation checks available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-8 text-xs text-gray-400">
        {position?.generated_at && <span>Generated at {new Date(position.generated_at).toLocaleString()}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'received' || status === 'active' ? 'bg-blue-100 text-blue-800'
    : status === 'completed' ? 'bg-green-100 text-green-800'
    : status === 'defaulted' ? 'bg-red-100 text-red-800'
    : 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>;
}
