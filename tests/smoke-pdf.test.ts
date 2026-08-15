import { generateDocument, buildEnvelope } from '@/modules/documents';
import type { DocumentData } from '@/modules/documents';
import { renderDocument } from '@/lib/services/reports/report-renderer';

describe('PDF smoke test (pdfmake, browser-free)', () => {
  test('renders an organization summary to a non-empty PDF buffer', async () => {
    const envelope = await buildEnvelope({
      kind: 'organization_summary',
      title: 'Organization Summary',
      eyebrow: 'Organization Summary',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY 2025' },
    });
    const data: DocumentData = {
      kind: 'organization_summary',
      summary: {
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
    const result = await generateDocument({ kind: 'organization_summary', envelope, data });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1000);
    // PDF magic header
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 30000);

  test('renders a financial summary PDF', async () => {
    const envelope = await buildEnvelope({
      kind: 'financial_summary',
      title: 'Financial Summary',
      eyebrow: 'Financial Summary',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All time' },
    });
    const data: DocumentData = {
      kind: 'financial_summary',
      summary: {
        savings: { deposits: 100, withdrawals: 10, balance: 90 },
        contributions: { deposits: 50, withdrawals: 0, balance: 50 },
        welfare: { deposits: 20, disbursements: 5, balance: 15 },
        fines: { posted: 5, paid: 2, balance: 3 },
        loans: { disbursed: 30, repaid: 5, outstanding: 25 },
        totals: { inflow: 175, outflow: 22, net: 153 },
      },
    };
    const result = await generateDocument({ kind: 'financial_summary', envelope, data });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 30000);

  test('HTML letterhead + stamp are well-formed in the rendered preview output', () => {
    // The HTML renderer is kept for the dashboard preview banner.
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
    expect(html.match(/<header class="letterhead">/g)).toHaveLength(1);
    expect(html.match(/class="cert-stamp"/g)).toHaveLength(1);
    expect(html.match(/class="doc-footer"/g)).toHaveLength(1);
    expect(html.match(/<style>/g)).toHaveLength(1);
  });
});
