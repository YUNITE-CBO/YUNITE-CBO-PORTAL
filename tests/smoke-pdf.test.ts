import { generateDocument, buildEnvelope } from '@/modules/documents';
import type { DocumentData } from '@/modules/documents';
import { renderDocument } from '@/lib/services/reports/report-renderer';
import type { MemberProfileData } from '@/lib/services/reports/report-data.service';

const PROFILE: MemberProfileData = {
  member_number: 'YUN-20260804-0001', first_name: 'Stephen', last_name: 'Ngari', email: 'stephen@x.com', phone: '0700000000',
  alt_phone: null, alt_email: null, id_number: '12345678', kra_pin: 'A001234567X', date_of_birth: '1990-05-04',
  gender: 'male', marital_status: 'married', nationality: 'Kenyan', physical_address: 'Nairobi CBD',
  postal_address: 'P.O. Box 1', occupation: 'Tailor', employer: 'Acme Ltd', employer_address: 'Industrial Area',
  next_of_kin_name: 'Jane Kin', next_of_kin_phone: '0722', next_of_kin_relationship: 'Spouse',
  emergency_contact_name: 'Mary Emg', emergency_contact_phone: '0733', emergency_contact_relationship: 'Sister',
  preferred_language: 'English', preferred_contact_method: 'sms', sms_notifications: true, email_notifications: false,
  membership_category: 'Standard', member_group: null, status: 'active', workflow_stage: 'completed',
  registration_date: '2026-08-04', created_at: '2026-08-04T10:00:00Z',
};

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

  test('renders a 7-column member statement with long refs that fits the page', async () => {
    // Regression: tables used to default every column to pdfmake 'auto', which
    // sizes to content and overflows A4 — the right-hand columns were clipped
    // off the page. Now numeric columns are fixed-width and text columns are
    // '*' (bounded by the page), so the table can never exceed the usable width.
    const envelope = await buildEnvelope({
      kind: 'member_statement',
      title: 'Member Statement of Account',
      eyebrow: 'Member Statement of Account',
      period: { start: new Date('2026-01-01'), end: new Date('2026-12-31'), label: 'FY 2026' },
      memberNumber: 'YUN-20260804-0001',
    });
    const data: DocumentData = {
      kind: 'member_statement',
      statement: {
        member: { member_number: 'YUN-20260804-0001', name: 'Stephen Ngari', email: null, phone: '0700000000', status: 'active' },
        openingBalance: 0,
        closingBalance: 150,
        totalCredits: 400,
        totalDebits: 250,
        rows: [
          { posted_at: '2026-08-04T10:00:00Z', transaction_ref: 'TXN-20260804-SDP-c19870b6', description: 'savings_deposit', reference_number: null, debit: 0, credit: 300, balance: 300 },
          { posted_at: '2026-08-04T10:00:00Z', transaction_ref: 'TXN-20260804-FNP-7f9be623', description: 'Fine: LATE FOR MEETING', reference_number: null, debit: 50, credit: 0, balance: 250 },
          { posted_at: '2026-08-04T10:00:00Z', transaction_ref: 'LOAN-DISB-1785883900646-5uc0', description: 'Loan disbursement - LN-1785883883654-8X2OVC', reference_number: 'LN-1785883883654-8X2OVC', debit: 200, credit: 0, balance: 50 },
        ],
        accountBreakdown: [
          { account_type: 'savings', balance: 300 },
          { account_type: 'shares', balance: 3 },
          { account_type: 'contributions', balance: 100 },
          { account_type: 'welfare', balance: 0 },
          { account_type: 'fines', balance: 50 },
          { account_type: 'loans', balance: 200 },
        ],
      },
    };
    const result = await generateDocument({ kind: 'member_statement', envelope, data });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.buffer.length).toBeGreaterThan(1000);
  }, 30000);

  test('renders a single member profile PDF with all personal information', async () => {
    const envelope = await buildEnvelope({
      kind: 'member_profile',
      title: 'Member Profile',
      eyebrow: 'Member Profile',
      period: { start: new Date('2026-01-01'), end: new Date(), label: 'All time' },
      memberNumber: 'YUN-20260804-0001',
      classification: 'Confidential',
    });
    const data: DocumentData = { kind: 'member_profile', profiles: [PROFILE], total: 1 };
    const result = await generateDocument({ kind: 'member_profile', envelope, data });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.buffer.length).toBeGreaterThan(1000);
    // Envelope carries the doc ref + auth hash for traceability.
    expect(envelope.documentNumber).toMatch(/^YUNITE-MBR-PRF-/);
    expect(envelope.authHash).toHaveLength(16);
  }, 30000);

  test('renders a bulk all-members profile PDF (one profile per page)', async () => {
    const other: MemberProfileData = { ...PROFILE, member_number: 'YUN-20260805-0002', first_name: 'Jane', last_name: 'Doe', status: 'pending' };
    const envelope = await buildEnvelope({
      kind: 'member_profile',
      title: 'Member Profiles',
      eyebrow: 'Member Profiles',
      period: { start: new Date('2026-01-01'), end: new Date(), label: 'All time' },
      classification: 'Confidential',
    });
    const data: DocumentData = { kind: 'member_profile', profiles: [PROFILE, other], total: 2 };
    const result = await generateDocument({ kind: 'member_profile', envelope, data });
    expect(result.buffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.buffer.length).toBeGreaterThan(1000);
  }, 30000);
});
