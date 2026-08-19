/**
 * Tests for the document rendering engine (brand, letterhead, stamp,
 * traceability). These are pure-function tests — no DB, no browser.
 */

import {
  ORG_IDENTITY,
  BRAND_COLORS,
  LOGO_SVG,
  STAMP_SVG,
  formatMoney,
  formatDate,
} from '@/lib/services/reports/brand';
import {
  renderDocument,
  type ReportPayload,
} from '@/lib/services/reports/report-renderer';
import type { ReportContext, MemberProfileData } from '@/lib/services/reports/report-data.service';

const FULL_PROFILE: MemberProfileData = {
  member_number: 'YP-001',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@x.com',
  phone: '0700',
  alt_phone: null,
  alt_email: null,
  id_number: '12345678',
  kra_pin: 'A001234567X',
  date_of_birth: '1990-05-04',
  gender: 'female',
  marital_status: 'married',
  nationality: 'Kenyan',
  physical_address: 'Nairobi CBD',
  postal_address: 'P.O. Box 1',
  occupation: 'Tailor',
  employer: 'Acme Ltd',
  employer_address: 'Industrial Area',
  next_of_kin_name: 'John Kin',
  next_of_kin_phone: '0722',
  next_of_kin_relationship: 'Spouse',
  emergency_contact_name: 'Mary Emg',
  emergency_contact_phone: '0733',
  emergency_contact_relationship: 'Sister',
  preferred_language: 'English',
  preferred_contact_method: 'sms',
  sms_notifications: true,
  email_notifications: false,
  membership_category: 'Standard',
  member_group: null,
  status: 'active',
  workflow_stage: 'completed',
  registration_date: '2025-01-02',
  created_at: '2025-01-02T10:00:00Z',
};

describe('brand identity', () => {
  test('carries the official YUNITE PAMOJA CBO identity', () => {
    expect(ORG_IDENTITY.name).toBe('YUNITE PAMOJA CBO');
    expect(ORG_IDENTITY.city).toBe('Nairobi');
    expect(ORG_IDENTITY.country).toBe('Kenya');
    // The canonical fallback carries NO invented contact details or
    // registration number — those must come from Settings.
    expect(ORG_IDENTITY.registrationNumber).toBe('');
    expect(ORG_IDENTITY.email).toBe('');
    expect(ORG_IDENTITY.phone).toBe('');
    expect(ORG_IDENTITY.website).toBe('');
  });

  test('copyright text is present and current', () => {
    expect(ORG_IDENTITY.copyright).toContain('YUNITE PAMOJA CBO');
    expect(ORG_IDENTITY.copyright).toContain('All rights reserved');
    expect(ORG_IDENTITY.copyright).toContain(String(new Date().getFullYear()));
  });

  test('theme uses deep navy blue and luminous green', () => {
    expect(BRAND_COLORS.navy).toBe('#0B2A4A');
    expect(BRAND_COLORS.green).toBe('#22C55E');
    expect(BRAND_COLORS.greenBright).toBe('#4ADE80');
  });

  test('logo + stamp are non-empty inline SVGs', () => {
    expect(LOGO_SVG).toContain('<svg');
    expect(LOGO_SVG).toContain('YUNITE');
    expect(LOGO_SVG).toContain('PAMOJA');
    expect(STAMP_SVG).toContain('<svg');
    expect(STAMP_SVG).toContain('YUNITE PAMOJA CBO');
    expect(STAMP_SVG).toContain('__REF__'); // placeholder substituted by renderer
  });
});

describe('formatters', () => {
  test('formatMoney formats currency with thousands separator', () => {
    const out = formatMoney(1234.5);
    expect(out).toMatch(/1,234\.50/);
  });

  test('formatMoney handles non-finite gracefully', () => {
    expect(formatMoney(NaN)).toContain('0.00');
  });

  test('formatDate formats a date', () => {
    const out = formatDate('2025-08-11');
    expect(out).toMatch(/11.*Aug.*2025/);
  });

  test('formatDate handles null/invalid', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('renderDocument — letterhead, stamp & traceability', () => {
  const baseCtx: ReportContext = {
    type: 'organization_summary',
    period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY 2025' },
  };

  const payload: ReportPayload = {
    orgSummary: {
      memberCounts: { total: 50, active: 42, pending: 5, suspended: 3 },
      financial: {
        savings: { deposits: 100000, withdrawals: 20000, balance: 80000 },
        contributions: { deposits: 50000, withdrawals: 0, balance: 50000 },
        welfare: { deposits: 10000, disbursements: 2000, balance: 8000 },
        fines: { posted: 5000, paid: 3000, balance: 2000 },
        loans: { disbursed: 30000, repaid: 10000, outstanding: 20000 },
        totals: { inflow: 165000, outflow: 35000, net: 130000 },
      },
      pendingLoans: 2,
      pendingFines: 1,
      currency: 'KES',
    },
  };

  const rendered = renderDocument(baseCtx, payload);

  test('returns a unique reference + authenticity hash', () => {
    expect(rendered.ref).toMatch(/^YP-DOC\/ORGANIZATION\//);
    expect(rendered.hash).toMatch(/^[A-F0-9]{16}$/);
    expect(rendered.generatedAt).toBeTruthy();
  });

  test('two renders produce different references', () => {
    const r2 = renderDocument(baseCtx, payload);
    expect(r2.ref).not.toBe(rendered.ref);
    expect(r2.hash).not.toBe(rendered.hash);
  });

  test('HTML is self-contained (no external asset requests)', () => {
    expect(rendered.html).toContain('<!DOCTYPE html>');
    // Logo inlined as SVG (not an <img src="http...">)
    expect(rendered.html).toContain('YUNITE');
    expect(rendered.html).not.toMatch(/<img[^>]+src="https?:/);
  });

  test('HTML includes the letterhead with org identity', () => {
    expect(rendered.html).toContain(ORG_IDENTITY.name);
    expect(rendered.html).toContain(ORG_IDENTITY.email);
    expect(rendered.html).toContain(ORG_IDENTITY.address);
    expect(rendered.html).toContain(BRAND_COLORS.navy);
    expect(rendered.html).toContain(BRAND_COLORS.green);
  });

  test('HTML includes the certification stamp with substituted traceability', () => {
    // The placeholders must be substituted with the actual ref/hash
    expect(rendered.html).not.toContain('__REF__');
    expect(rendered.html).not.toContain('__HASH__');
    expect(rendered.html).toContain(rendered.ref);
    expect(rendered.html).toContain(rendered.hash);
    expect(rendered.html).toContain('DOCUMENT CERTIFIED');
  });

  test('HTML includes the footer copyright + verification URL', () => {
    expect(rendered.html).toContain(ORG_IDENTITY.copyright.slice(0, 20));
    expect(rendered.html).toContain('/verify/');
    expect(rendered.html).toContain(rendered.ref);
  });

  test('HTML includes period label + meta block + report title', () => {
    expect(rendered.html).toContain('FY 2025');
    expect(rendered.html).toContain('Organization Summary'); // section title
    expect(rendered.html).toContain('Official Document'); // eyebrow
  });
});

describe('renderDocument — per-type bodies', () => {
  test('financial_summary renders KPIs + table', () => {
    const ctx: ReportContext = {
      type: 'financial_summary',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All time' },
    };
    const payload: ReportPayload = {
      financialSummary: {
        savings: { deposits: 100, withdrawals: 10, balance: 90 },
        contributions: { deposits: 50, withdrawals: 0, balance: 50 },
        welfare: { deposits: 20, disbursements: 5, balance: 15 },
        fines: { posted: 5, paid: 2, balance: 3 },
        loans: { disbursed: 30, repaid: 5, outstanding: 25 },
        totals: { inflow: 175, outflow: 22, net: 153 },
      },
    };
    const r = renderDocument(ctx, payload);
    expect(r.html).toContain('Account Balances');
    expect(r.html).toContain('Savings');
    expect(r.html).toContain('Totals');
  });

  test('member_list renders member rows', () => {
    const ctx: ReportContext = {
      type: 'member_list',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const payload: ReportPayload = {
      memberList: {
        members: [
          { member_number: 'YP-001', first_name: 'Jane', last_name: 'Doe', email: 'jane@x.com', phone: '0700', gender: 'female', status: 'active', occupation: 'Tailor', registration_date: '2025-01-02', physical_address: null },
          { member_number: 'YP-002', first_name: 'John', last_name: 'Roe', email: null, phone: '0711', gender: 'male', status: 'pending', occupation: null, registration_date: '2025-02-02', physical_address: null },
        ],
        total: 2,
      },
    };
    const r = renderDocument(ctx, payload);
    expect(r.html).toContain('YP-001');
    expect(r.html).toContain('Jane');
    expect(r.html).toContain('John');
  });

  test('member_statement renders opening/closing balances + transactions', () => {
    const ctx: ReportContext = {
      type: 'member_statement',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY2025' },
      memberId: '00000000-0000-0000-0000-000000000001',
    };
    const payload: ReportPayload = {
      memberStatement: {
        member: { member_number: 'YP-001', name: 'Jane Doe', email: 'jane@x.com', phone: '0700', status: 'active' },
        openingBalance: 1000,
        closingBalance: 1500,
        totalCredits: 700,
        totalDebits: 200,
        rows: [
          { posted_at: '2025-03-01', transaction_ref: 'TXN-1', description: 'Savings Deposit', reference_number: 'R1', debit: 0, credit: 500, balance: 1500 },
        ],
        accountBreakdown: [{ account_type: 'savings', balance: 1500 }],
      },
    };
    const r = renderDocument(ctx, payload);
    expect(r.html).toContain('Opening Balance');
    expect(r.html).toContain('Closing Balance');
    expect(r.html).toContain('Jane Doe');
    expect(r.html).toContain('TXN-1');
  });

  test('empty data sets render an empty note, not a crash', () => {
    const ctx: ReportContext = {
      type: 'member_list',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const r = renderDocument(ctx, { memberList: { members: [], total: 0 } });
    expect(r.html).toContain('No members on record');
  });

  test('member_profile renders the full personal information for one member', () => {
    const ctx: ReportContext = {
      type: 'member_profile',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
      memberId: '00000000-0000-0000-0000-000000000001',
    };
    const payload: ReportPayload = {
      memberProfile: { profiles: [FULL_PROFILE], total: 1 },
    };
    const r = renderDocument(ctx, payload);
    expect(r.title).toBe('Member Profile');
    // Every profile section is present.
    for (const section of ['Personal Information', 'Contact Information', 'Employment', 'Next of Kin', 'Emergency Contact', 'Communication Preferences', 'Membership Details']) {
      expect(r.html).toContain(section);
    }
    // Personal information values are rendered.
    expect(r.html).toContain('Jane Doe');
    expect(r.html).toContain('YP-001');
    expect(r.html).toContain('12345678');
    expect(r.html).toContain('A001234567X');
    expect(r.html).toContain('Nairobi CBD');
    expect(r.html).toContain('Acme Ltd');
    expect(r.html).toContain('John Kin');
    expect(r.html).toContain('Mary Emg');
    // Null optional fields render the em-dash fallback, never "null".
    expect(r.html).not.toContain('>null<');
  });

  test('member_profile without a member scope renders ALL members, one per page', () => {
    const other = { ...FULL_PROFILE, member_number: 'YP-002', first_name: 'John', last_name: 'Roe', status: 'pending' };
    const ctx: ReportContext = {
      type: 'member_profile',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const r = renderDocument(ctx, { memberProfile: { profiles: [FULL_PROFILE, other], total: 2 } });
    expect(r.html).toContain('Profiles for <strong>2</strong> members');
    expect(r.html).toContain('Jane Doe');
    expect(r.html).toContain('John Roe');
    // Bulk export page-breaks between member profiles.
    expect(r.html).toContain('page-break-before: always');
  });

  test('member_profile with no members renders an empty note', () => {
    const ctx: ReportContext = {
      type: 'member_profile',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const r = renderDocument(ctx, { memberProfile: { profiles: [], total: 0 } });
    expect(r.html).toContain('No members on record');
  });

  test('unity_fund_report renders position, sources, expenditures, liabilities, reconciliation', () => {
    const ctx: ReportContext = {
      type: 'unity_fund_report',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All time' },
    };
    const payload: ReportPayload = {
      unityFundReport: {
        position: {
          actual_balance: 250000,
          pending_receivables: 30000,
          total_receipts: 300000,
          total_expenditures: 50000,
          organization_liabilities: 100000,
          net_financial_position: 150000,
          currency: 'KES',
        },
        sources: [
          { source: 'loan_interest', label: 'Loan Interest', actual: 120000, pending: 10000, transaction_count: 42 },
          { source: 'fines', label: 'Fines', actual: 80000, pending: 20000, transaction_count: 18 },
        ],
        expenditures: {
          total_expenditures: 50000,
          by_category: [{ category: 'Office Operations', total: 30000, count: 5 }, { category: 'Community Project', total: 20000, count: 2 }],
        },
        liabilities: {
          total_organization_loans_received: 100000,
          total_organization_loans_repaid: 0,
          outstanding_liabilities: 100000,
          loans: [{ org_loan_number: 'YP-ORG-LOAN-001', lender_name: 'Sacco A', received_amount: 100000, repaid_amount: 0, outstanding_liability: 100000, status: 'received' }],
        },
        reconciliation: {
          status: 'consistent',
          ledger_balance: 250000,
          source_balance: 250000,
          difference: 0,
          checks: [{ label: 'Engine ledger = source recomputation', expected: 250000, actual: 250000, difference: 0, passed: true }],
        },
        generated_at: '2025-08-16T00:00:00.000Z',
      },
    };
    const r = renderDocument(ctx, payload);
    expect(r.ref).toMatch(/YP-DOC\/UNITY-FUND/);
    expect(r.html).toContain('Unity Fund Report');
    expect(r.html).toContain('250,000');
    expect(r.html).toContain('Loan Interest');
    expect(r.html).toContain('Office Operations');
    expect(r.html).toContain('YP-ORG-LOAN-001');
    expect(r.html).toContain('CONSISTENT');
    // Pending receivables must be shown and never conflated with actual cash.
    expect(r.html).toContain('30,000');
  });
});
