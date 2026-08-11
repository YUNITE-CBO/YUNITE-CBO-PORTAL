import { htmlToPdf, closeBrowser } from '@/lib/services/reports/document-generator';
import { renderDocument } from '@/lib/services/reports/report-renderer';

describe('PDF smoke test', () => {
  afterAll(async () => {
    // Close the cached headless browser so jest can exit cleanly.
    await closeBrowser();
  });

  test('renders a small HTML to a non-empty PDF buffer', async () => {
    const ctx: any = {
      type: 'organization_summary',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY 2025' },
    };
    const payload: any = {
      orgSummary: {
        memberCounts: { total: 5, active: 4, pending: 1, suspended: 0 },
        financial: {
          savings: { deposits: 100, withdrawals: 10, balance: 90 },
          contributions: { deposits: 50, withdrawals: 0, balance: 50 },
          welfare: { deposits: 20, disbursements: 5, balance: 15 },
          fines: { posted: 5, paid: 2, balance: 3 },
          loans: { disbursed: 30, repaid: 5, outstanding: 25 },
          totals: { inflow: 175, outflow: 22, net: 153 },
        },
        pendingLoans: 0,
        pendingFines: 0,
        currency: 'KES',
      },
    };
    const { html } = renderDocument(ctx, payload);
    const pdf = await htmlToPdf(html);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    // PDF magic header
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 60000);

  test('HTML letterhead + stamp are well-formed in the rendered output', () => {
    const ctx: any = {
      type: 'financial_summary',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All time' },
    };
    const payload: any = {
      financialSummary: {
        savings: { deposits: 100, withdrawals: 10, balance: 90 },
        contributions: { deposits: 50, withdrawals: 0, balance: 50 },
        welfare: { deposits: 20, disbursements: 5, balance: 15 },
        fines: { posted: 5, paid: 2, balance: 3 },
        loans: { disbursed: 30, repaid: 5, outstanding: 25 },
        totals: { inflow: 175, outflow: 22, net: 153 },
      },
    };
    const { html } = renderDocument(ctx, payload);
    // structural sanity: balanced opening of the key containers
    expect(html.match(/<header class="letterhead">/g)).toHaveLength(1);
    expect(html.match(/class="cert-stamp"/g)).toHaveLength(1);
    expect(html.match(/class="doc-footer"/g)).toHaveLength(1);
    expect(html.match(/<style>/g)).toHaveLength(1);
  });
});
