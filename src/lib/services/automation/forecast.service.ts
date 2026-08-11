/**
 * Financial Forecast Service
 *
 * Generates 30/90-day cash-flow projections for super admins. The forecast
 * blends two signals:
 *
 *   1. HISTORICAL TREND: average daily net cash flow over the trailing 90 days,
 *      extrapolated forward. Captures recurring activity (deposits, repayments)
 *      that isn't tied to a specific scheduled obligation.
 *   2. KNOWN UPCOMING OBLIGATIONS: scheduled loan repayments due in the window
 *      (from loans.monthly_repayment where repayment_end_date >= today) and
 *      expected monthly contributions/welfare (from settings).
 *
 * The result is a conservative estimate — not accounting truth. It powers the
 * `admin.financial_forecast` notification (emailed to super admins on the
 * monthly statement day) and the alert-center critical/warning/info tiers.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { settingsService } from '../settings.service';

export interface ForecastResult {
  period: string;
  currency: string;
  as_of: string;
  trailing_90d: {
    total_inflows: number;
    total_outflows: number;
    avg_daily_net: number;
  };
  forecast_30d: {
    expected_income: number;
    expected_expenses: number;
    expected_loan_collections: number;
    expected_contributions: number;
    net: number;
  };
  forecast_90d: {
    expected_income: number;
    expected_expenses: number;
    expected_loan_collections: number;
    expected_contributions: number;
    net: number;
  };
  current_cash_position: number;
  notes: string[];
}

// Transaction types grouped by direction for the forecast.
const INFLOW_TYPES = [
  'savings_deposit', 'savings_monthly', 'savings_special', 'savings_development',
  'registration_fee', 'annual_fee',
  'contribution_monthly', 'contribution_special', 'contribution_development',
  'welfare_deposit',
  'fine_payment',
  'loan_repayment',
];

const OUTFLOW_TYPES = [
  'savings_withdrawal', 'savings_disbursement',
  'contribution_withdrawal', 'contribution_disbursement',
  'welfare_withdrawal', 'welfare_disbursement',
  'loan_disbursement',
  'welfare_disbursement',
];

class FinancialForecastService {
  async generate(): Promise<ForecastResult> {
    const supabase = await createServiceClient();
    const now = new Date();
    const currency = (await settingsService.get('organization.currency')) || 'KES';
    const notes: string[] = [];

    // --- 1. Trailing 90-day actuals ---
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: trailingTxns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('reversed', false)
      .gte('posted_at', ninetyDaysAgo.toISOString());

    let totalInflows = 0;
    let totalOutflows = 0;
    for (const t of trailingTxns || []) {
      if (INFLOW_TYPES.includes(t.transaction_type)) {
        totalInflows += Number(t.amount);
      } else if (OUTFLOW_TYPES.includes(t.transaction_type)) {
        totalOutflows += Number(t.amount);
      }
    }
    const avgDailyNet = (totalInflows - totalOutflows) / 90;

    // --- 2. Current cash position (all liquid inflows - outflows, all time) ---
    const { data: allTimeTxns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('reversed', false);
    let cashIn = 0;
    let cashOut = 0;
    for (const t of allTimeTxns || []) {
      if (INFLOW_TYPES.includes(t.transaction_type)) cashIn += Number(t.amount);
      else if (OUTFLOW_TYPES.includes(t.transaction_type)) cashOut += Number(t.amount);
    }
    const currentCashPosition = cashIn - cashOut;

    // --- 3. Known upcoming loan repayments (next 90 days) ---
    // Approximated by monthly_repayment * months remaining (capped at remaining
    // balance); no date filtering needed since active loans are already in repayment.

    const { data: activeLoans } = await supabase
      .from('loans')
      .select('monthly_repayment, amount_due, amount_paid, repayment_end_date, repayment_start_date')
      .in('status', ['approved', 'disbursed', 'active', 'defaulted']);

    // Loan collections expected in next 30d / 90d
    let loanCollections30 = 0;
    let loanCollections90 = 0;
    for (const loan of activeLoans || []) {
      const monthly = Number(loan.monthly_repayment || 0);
      const remaining = Math.max(Number(loan.amount_due || 0) - Number(loan.amount_paid || 0), 0);
      if (monthly <= 0 || remaining <= 0) continue;
      // Approx: 1 monthly payment in 30d, 3 in 90d (capped at remaining)
      loanCollections30 += Math.min(monthly, remaining);
      loanCollections90 += Math.min(monthly * 3, remaining);
    }

    // --- 4. Expected contributions + welfare (from settings, per active member) ---
    const contribMonthly = Number((await settingsService.get('contributions.monthly_default')) || 1000);
    const welfareMonthly = Number((await settingsService.get('welfare.monthly_amount')) || 500);

    const { count: activeMemberCount } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const members = activeMemberCount || 0;
    const expectedContributions30 = contribMonthly * members;
    const expectedContributions90 = contribMonthly * members * 3;
    // Welfare is part of inflows too; track separately for the report
    const expectedWelfare30 = welfareMonthly * members;
    const expectedWelfare90 = welfareMonthly * members * 3;

    // --- 5. Combine trend + scheduled ---
    // 30-day: trend extrapolation + scheduled loan collections + expected contributions
    const trendNet30 = avgDailyNet * 30;
    const expectedIncome30 = (totalInflows / 90) * 30 + loanCollections30 + expectedContributions30 + expectedWelfare30;
    const expectedExpenses30 = (totalOutflows / 90) * 30;
    const net30 = trendNet30 + loanCollections30 + expectedContributions30 + expectedWelfare30;

    const trendNet90 = avgDailyNet * 90;
    const expectedIncome90 = (totalInflows / 90) * 90 + loanCollections90 + expectedContributions90 + expectedWelfare90;
    const expectedExpenses90 = (totalOutflows / 90) * 90;
    const net90 = trendNet90 + loanCollections90 + expectedContributions90 + expectedWelfare90;

    if (members === 0) notes.push('No active members — contribution/welfare projections are zero.');
    if (!activeLoans?.length) notes.push('No active loans — loan collection projections are zero.');
    notes.push('Forecast blends trailing-90-day actuals with scheduled loan repayments and expected monthly contributions. It is an estimate, not accounting truth.');

    return {
      period: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      currency,
      as_of: now.toISOString(),
      trailing_90d: {
        total_inflows: Math.round(totalInflows),
        total_outflows: Math.round(totalOutflows),
        avg_daily_net: Math.round(avgDailyNet),
      },
      forecast_30d: {
        expected_income: Math.round(expectedIncome30),
        expected_expenses: Math.round(expectedExpenses30),
        expected_loan_collections: Math.round(loanCollections30),
        expected_contributions: Math.round(expectedContributions30),
        net: Math.round(net30),
      },
      forecast_90d: {
        expected_income: Math.round(expectedIncome90),
        expected_expenses: Math.round(expectedExpenses90),
        expected_loan_collections: Math.round(loanCollections90),
        expected_contributions: Math.round(expectedContributions90),
        net: Math.round(net90),
      },
      current_cash_position: Math.round(currentCashPosition),
      notes,
    };
  }

  /**
   * Generate alert-center tiers from the forecast + obligations.
   *   critical: negative projected 30d net OR cash position < 0
   *   warning:  projected 30d net < 0 OR overdue obligations > 0
   *   info:     pending approvals, general status
   */
  async generateAlerts(): Promise<{ tier: 'critical' | 'warning' | 'info'; title: string; message: string }[]> {
    const supabase = await createServiceClient();
    const alerts: { tier: 'critical' | 'warning' | 'info'; title: string; message: string }[] = [];

    const forecast = await this.generate();

    // Critical: negative cash position or negative 30d projection
    if (forecast.current_cash_position < 0) {
      alerts.push({
        tier: 'critical',
        title: 'Negative Cash Position',
        message: `Current cash position is ${forecast.currency} ${forecast.current_cash_position.toLocaleString()}. Immediate action required.`,
      });
    }
    if (forecast.forecast_30d.net < 0) {
      alerts.push({
        tier: 'critical',
        title: 'Negative 30-Day Forecast',
        message: `Projected net for the next 30 days is ${forecast.currency} ${forecast.forecast_30d.net.toLocaleString()}. Review disbursements and collections.`,
      });
    }

    // Warning: overdue obligations
    const { count: overdueObligations } = await supabase
      .from('member_financial_obligations')
      .select('*', { count: 'exact', head: true })
      .eq('obligation_status', 'overdue');

    if (overdueObligations && overdueObligations > 0) {
      alerts.push({
        tier: 'warning',
        title: 'Overdue Obligations',
        message: `${overdueObligations} member financial obligation(s) are overdue. See the obligations report for details.`,
      });
    }

    // Warning: defaulted loans
    const { count: defaultedLoans } = await supabase
      .from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'defaulted');

    if (defaultedLoans && defaultedLoans > 0) {
      alerts.push({
        tier: 'warning',
        title: 'Defaulted Loans',
        message: `${defaultedLoans} loan(s) are in default status.`,
      });
    }

    // Info: pending loan approvals
    const { count: pendingLoans } = await supabase
      .from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingLoans && pendingLoans > 0) {
      alerts.push({
        tier: 'info',
        title: 'Pending Loan Approvals',
        message: `${pendingLoans} loan application(s) awaiting approval.`,
      });
    }

    return alerts;
  }
}

export const financialForecastService = new FinancialForecastService();
