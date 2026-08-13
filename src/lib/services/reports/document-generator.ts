/**
 * DOCUMENT GENERATOR (PDF + CSV)
 *
 * PDF: renders the self-contained HTML report via headless Chromium
 * (puppeteer, which bundles a compatible Chromium in its cache). The cache
 * is populated by `scripts/install-browser.js` (run as an npm `postinstall`
 * during `npm ci`), which forces the download regardless of
 * PUPPETEER_EXECUTABLE_PATH/PUPPETEER_SKIP_DOWNLOAD — so the browser is
 * always present at runtime even when stale env vars are set on the host.
 *
 * CSV: produced directly from the report data (no browser needed) for fast,
 * lossless spreadsheet exports.
 */

import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { getInstalledBrowsers, Browser as InstalledBrowserBrand } from '@puppeteer/browsers';
import {
  ReportContext,
  FinancialSummaryData,
  MemberRow,
  LoanRow,
  TransactionRow,
  ContributionRow,
  FineRow,
  MemberStatementData,
  WelfareData,
  OrgSummaryData,
} from './report-data.service';
import { formatMoney, formatDate } from './brand';

// System Chromium executables consulted as a last resort when the bundled
// browser cache is absent (e.g. a host that already ships Chrome/Chromium).
// These are the real binaries, not launcher scripts — on some distros
// `/usr/bin/chromium` is a tiny shell wrapper whose real binary lives in
// `/usr/lib/chromium/chromium`, so we list both and the executable itself.
const SYSTEM_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/local/bin/chromium',
  '/usr/lib/chromium/chromium',
  '/usr/lib/chromium-browser/chromium',
  '/opt/google/chrome/chrome',
];

/**
 * Resolve the Chromium executable to launch.
 *
 * Priority:
 *   1. PUPPETEER_EXECUTABLE_PATH / CHROMIUM_PATH / CHROME_PATH env override
 *      (only when the referenced file actually exists on disk — a stale env
 *      var pointing at a missing path is skipped, not fatal),
 *   2. the bundled browser cache (populated by the postinstall script
 *      `scripts/install-browser.js`, which forces the download regardless of
 *      env vars, so this works even when PUPPETEER_EXECUTABLE_PATH is set).
 *      Detection uses @puppeteer/browsers' getInstalledBrowsers(), which
 *      reads the cache directly and is env-agnostic, so a stale
 *      PUPPETEER_EXECUTABLE_PATH cannot mask the bundled browser, and an
 *      empty cache dir is handled cleanly (returns []).
 *   3. common system Chromium/Chrome locations.
 *
 * The bundled cache is the default in production (no root/system package
 * needed). We never call puppeteer.executablePath() for detection, because
 * it honors PUPPETEER_EXECUTABLE_PATH and would thus miss the cache when
 * that env var is stale.
 */
async function resolveChromium(): Promise<string> {
  const checked: string[] = [];

  for (const p of [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROMIUM_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[]) {
    checked.push(p);
    if (existsSync(p)) return p;
  }

  // Bundled browser cache. getInstalledBrowsers() reads the cache directly
  // (env-agnostic) and returns the authoritative executablePath for each
  // installed browser, including the pinned build from the postinstall
  // script. Robust to a stale PUPPETEER_EXECUTABLE_PATH and to a cache
  // directory that exists but is empty (it simply returns []).
  try {
    const installed = await getInstalledBrowsers({
      cacheDir: process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer'),
    });
    for (const b of installed) {
      if (b.browser === InstalledBrowserBrand.CHROME && b.executablePath) {
        checked.push(b.executablePath);
        if (existsSync(b.executablePath)) return b.executablePath;
      }
    }
  } catch {
    // cache unreadable / @puppeteer/browsers unavailable; fall through
  }

  for (const p of SYSTEM_PATHS) {
    checked.push(p);
    if (existsSync(p)) return p;
  }

  throw new Error(
    'Chromium executable not found for PDF generation. The bundled browser ' +
      'is downloaded by the postinstall script (scripts/install-browser.js) ' +
      'during `npm ci`; ensure that step ran and the cache persists to ' +
      'runtime. If the host provides a system Chromium, set ' +
      'PUPPETEER_EXECUTABLE_PATH to its real binary path. Checked: ' +
      (Array.from(new Set(checked)).join(', ') || '(none)') +
      '.',
  );
}

let cachedBrowser: PuppeteerBrowser | null = null;

async function getBrowser(): Promise<PuppeteerBrowser> {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }
  const executablePath = await resolveChromium();
  cachedBrowser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-features=site-per-process',
    ],
  });
  return cachedBrowser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close();
    cachedBrowser = null;
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRows(headers: string[], rows: Array<unknown[]>): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n');
}

export interface CsvPayload {
  financialSummary?: FinancialSummaryData;
  memberList?: { members: MemberRow[]; total: number };
  loanReport?: { loans: LoanRow[]; total: number };
  transactionReport?: { transactions: TransactionRow[]; total: number };
  contributionReport?: { rows: ContributionRow[]; total: number; totalAmount: number };
  fineReport?: { fines: FineRow[]; total: number };
  memberStatement?: MemberStatementData;
  welfareReport?: WelfareData;
  orgSummary?: OrgSummaryData;
}

export function reportToCsv(ctx: ReportContext, payload: CsvPayload): string {
  switch (ctx.type) {
    case 'financial_summary': {
      const f = payload.financialSummary!;
      return csvRows(
        ['Account Type', 'Inflow', 'Outflow', 'Balance'],
        [
          ['Savings', f.savings.deposits, f.savings.withdrawals, f.savings.balance],
          ['Contributions', f.contributions.deposits, f.contributions.withdrawals, f.contributions.balance],
          ['Welfare', f.welfare.deposits, f.welfare.disbursements, f.welfare.balance],
          ['Fines', f.fines.posted, f.fines.paid, f.fines.balance],
          ['Loans', f.loans.disbursed, f.loans.repaid, f.loans.outstanding],
          ['TOTALS', f.totals.inflow, f.totals.outflow, f.totals.net],
        ],
      );
    }
    case 'member_list': {
      const rows = payload.memberList!.members.map((m, i) => [
        i + 1, m.member_number, m.first_name, m.last_name, m.phone, m.email, m.occupation, m.gender, formatDate(m.registration_date), m.status,
      ]);
      return csvRows(['#', 'Member No', 'First Name', 'Last Name', 'Phone', 'Email', 'Occupation', 'Gender', 'Reg Date', 'Status'], rows);
    }
    case 'loan_report': {
      const rows = payload.loanReport!.loans.map((l) => [
        l.loan_number, l.member_number, l.member_name, l.loan_type, l.principal, l.interest_rate, l.total_amount, l.amount_paid, l.amount_due, l.monthly_repayment, l.status, formatDate(l.disbursement_date),
      ]);
      return csvRows(['Loan No', 'Member No', 'Member', 'Type', 'Principal', 'Rate', 'Total', 'Paid', 'Due', 'Monthly', 'Status', 'Disbursed'], rows);
    }
    case 'transaction_report': {
      const rows = payload.transactionReport!.transactions.map((t) => [
        formatDate(t.posted_at), t.transaction_ref, t.member_number, t.member_name, t.transaction_type, t.description, t.reference_number, t.amount, t.balance_after, t.reversed ? 'REVERSED' : '',
      ]);
      return csvRows(['Date', 'Ref', 'Member No', 'Member', 'Type', 'Description', 'Reference', 'Amount', 'Balance', 'Flags'], rows);
    }
    case 'contribution_report': {
      const rows = payload.contributionReport!.rows.map((r) => [
        formatDate(r.posted_at), r.member_number, r.member_name, r.type, r.reference, r.amount,
      ]);
      return csvRows(['Date', 'Member No', 'Member', 'Type', 'Reference', 'Amount'], rows);
    }
    case 'fine_report': {
      const rows = payload.fineReport!.fines.map((f) => [
        f.fine_number, f.member_number, f.member_name, f.fine_type, f.reason, f.amount, f.amount_paid, f.balance, f.status, formatDate(f.issued_date),
      ]);
      return csvRows(['Fine No', 'Member No', 'Member', 'Type', 'Reason', 'Issued Amount', 'Paid', 'Balance', 'Status', 'Issued Date'], rows);
    }
    case 'member_statement': {
      const s = payload.memberStatement!;
      const header = `Member,${s.member.name},No.,${s.member.member_number},Phone,${s.member.phone},Status,${s.member.status}\r\nPeriod,${ctx.period.label}\r\nOpening Balance,${s.openingBalance}\r\nClosing Balance,${s.closingBalance}\r\nTotal Credits,${s.totalCredits}\r\nTotal Debits,${s.totalDebits}\r\n`;
      const rows = s.rows.map((r) => [formatDate(r.posted_at), r.transaction_ref, r.description, r.reference_number, r.debit, r.credit, r.balance]);
      return header + csvRows(['Date', 'Ref', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'], rows);
    }
    case 'welfare_report': {
      const w = payload.welfareReport!;
      const header = `Total Deposits,${w.totalDeposits}\r\nTotal Disbursements,${w.totalDisbursements}\r\nBalance,${w.balance}\r\nMonthly Amount,${w.monthlyAmount}\r\n`;
      const rows = w.rows.map((r) => [formatDate(r.posted_at), r.member_number, r.member_name, r.type, r.reference, r.amount]);
      return header + csvRows(['Date', 'Member No', 'Member', 'Type', 'Reference', 'Amount'], rows);
    }
    case 'organization_summary': {
      const o = payload.orgSummary!;
      const c = o.memberCounts;
      const f = o.financial;
      return csvRows(
        ['Metric', 'Value'],
        [
          ['Total Members', c.total],
          ['Active Members', c.active],
          ['Pending Members', c.pending],
          ['Suspended Members', c.suspended],
          ['Pending Loans', o.pendingLoans],
          ['Pending Fines', o.pendingFines],
          ['Savings Balance', f.savings.balance],
          ['Contributions Balance', f.contributions.balance],
          ['Welfare Balance', f.welfare.balance],
          ['Fines Balance', f.fines.balance],
          ['Loans Outstanding', f.loans.outstanding],
        ],
      );
    }
    default:
      return '';
  }
}
