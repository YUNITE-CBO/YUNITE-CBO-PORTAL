/**
 * Tests for the document generator's CSV export (pure, no browser) and the
 * period resolver.
 */

import { reportToCsv } from '@/lib/services/reports/document-generator';
import { resolvePeriod } from '@/lib/services/reports/period';
import type { ReportContext } from '@/lib/services/reports/report-data.service';

describe('reportToCsv', () => {
  test('member_list CSV has a header row + escaped fields', () => {
    const ctx: ReportContext = {
      type: 'member_list',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const csv = reportToCsv(ctx, {
      memberList: {
        members: [
          { member_number: 'YP-001', first_name: 'Jane, Jr.', last_name: 'Doe', email: 'jane@x.com', phone: '0700', gender: 'female', status: 'active', occupation: 'Tailor', registration_date: '2025-01-02', physical_address: null },
        ],
        total: 1,
      },
    } as any);

    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('Member No');
    // comma in "Jane, Jr." must be quoted
    expect(csv).toContain('"Jane, Jr."');
    expect(csv).toContain('YP-001');
  });

  test('member_profile CSV carries all personal-information columns for one or all members', () => {
    const ctx: ReportContext = {
      type: 'member_profile',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const profile = {
      member_number: 'YP-001', first_name: 'Jane', last_name: 'Doe', id_number: '12345678', kra_pin: 'A001234567X',
      date_of_birth: '1990-05-04', gender: 'female', marital_status: 'married', nationality: 'Kenyan',
      phone: '0700', alt_phone: null, email: 'jane@x.com', alt_email: null, physical_address: 'Nairobi CBD', postal_address: null,
      occupation: 'Tailor', employer: 'Acme Ltd', employer_address: null,
      next_of_kin_name: 'John Kin', next_of_kin_phone: '0722', next_of_kin_relationship: 'Spouse',
      emergency_contact_name: 'Mary Emg', emergency_contact_phone: '0733', emergency_contact_relationship: 'Sister',
      preferred_language: 'English', preferred_contact_method: 'sms', sms_notifications: true, email_notifications: false,
      membership_category: 'Standard', member_group: null, status: 'active', workflow_stage: 'completed',
      registration_date: '2025-01-02', created_at: '2025-01-02T10:00:00Z',
    };
    const other = { ...profile, member_number: 'YP-002', first_name: 'John', last_name: 'Roe' };
    const csv = reportToCsv(ctx, { memberProfile: { profiles: [profile, other], total: 2 } } as any);

    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 members
    const header = lines[0];
    for (const col of ['Member No', 'ID Number', 'KRA PIN', 'Marital Status', 'Nationality', 'Next of Kin Name', 'Emergency Contact Name', 'Membership Category', 'Workflow Stage', 'Registration Date']) {
      expect(header).toContain(col);
    }
    expect(csv).toContain('YP-001');
    expect(csv).toContain('YP-002');
    expect(csv).toContain('A001234567X');
    expect(csv).toContain('John Kin');
    expect(csv).toContain('Mary Emg');
    // sms_notifications=true → Yes; email_notifications=false → No
    expect(lines[1]).toContain('Yes,No');
    // null optional fields come out as empty cells, never the string "null"
    expect(csv).not.toContain('null');
  });

  test('financial_summary CSV aggregates accounts', () => {
    const ctx: ReportContext = {
      type: 'financial_summary',
      period: { start: new Date('2025-01-01'), end: new Date(), label: 'All' },
    };
    const csv = reportToCsv(ctx, {
      financialSummary: {
        savings: { deposits: 100, withdrawals: 10, balance: 90 },
        contributions: { deposits: 50, withdrawals: 0, balance: 50 },
        welfare: { deposits: 20, disbursements: 5, balance: 15 },
        fines: { posted: 5, paid: 2, balance: 3 },
        loans: { disbursed: 30, repaid: 5, outstanding: 25 },
        totals: { inflow: 175, outflow: 22, net: 153 },
      },
    } as any);

    expect(csv).toContain('Account Type');
    expect(csv).toContain('Savings');
    expect(csv).toContain('TOTALS');
  });

  test('member_statement CSV prepends a member header block', () => {
    const ctx: ReportContext = {
      type: 'member_statement',
      period: { start: new Date('2025-01-01'), end: new Date('2025-12-31'), label: 'FY2025' },
      memberId: '00000000-0000-0000-0000-000000000001',
    };
    const csv = reportToCsv(ctx, {
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
    } as any);

    expect(csv).toContain('Member,Jane Doe');
    expect(csv).toContain('Opening Balance');
    expect(csv).toContain('TXN-1');
  });

  test('unknown type returns empty string', () => {
    const ctx = { type: 'unknown' as any, period: { start: new Date(), end: new Date(), label: 'x' } };
    expect(reportToCsv(ctx, {} as any)).toBe('');
  });
});

describe('resolvePeriod', () => {
  test('this_month starts on the 1st of the current month', () => {
    const p = resolvePeriod('this_month');
    expect(p.start.getDate()).toBe(1);
    expect(p.label).toContain('This month');
  });

  test('last_year spans the previous calendar year', () => {
    const p = resolvePeriod('last_year');
    expect(p.start.getFullYear()).toBe(new Date().getFullYear() - 1);
    expect(p.start.getMonth()).toBe(0);
    expect(p.end.getMonth()).toBe(11);
  });

  test('all_time starts in 2020', () => {
    const p = resolvePeriod('all_time');
    expect(p.start.getFullYear()).toBe(2020);
    expect(p.label).toContain('All time');
  });

  test('unknown key falls back to all_time', () => {
    const p = resolvePeriod('nonsense');
    expect(p.label).toContain('All time');
  });
});
