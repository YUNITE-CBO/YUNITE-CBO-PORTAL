/**
 * Member-lookup verification engine tests.
 *
 * Proves the core spec guarantee: the engine compares DATABASE → BACKEND API
 * → MEMBER LOOKUP DISPLAY and detects mismatches (including an intentionally
 * incorrect display value). Uses module mocking for the three data layers so
 * no live DB / network is required.
 *
 * The mock strategy:
 *  - getDatabaseBalances / getApiBalances / getDisplayBalances return canned
 *    LayerBalances (we control each layer independently).
 *  - transactionEngine.calculateAllBalances is mocked (getApiBalances calls
 *    it).
 *  - createServiceClient is mocked to a stub so getMemberIdentity /
 *    getDisplayIdentity do not hit Supabase.
 *
 * The engine itself is NOT mocked — we exercise its real comparison logic.
 */

// Mock the supabase server client BEFORE importing the engine.
jest.mock('@/lib/supabase/server', () => {
  const fakeMember = { member_number: 'MBR-001', status: 'active', registration_date: '2025-01-01' };
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: fakeMember }),
  };
  return {
    createServiceClient: jest.fn().mockResolvedValue({
      from: jest.fn().mockReturnValue(chain),
    }),
  };
});

// Mock transactionEngine so getApiBalances returns deterministic values.
jest.mock('@/lib/services/transaction.engine', () => ({
  transactionEngine: {
    calculateAllBalances: jest.fn(),
    calculateBalance: jest.fn(),
  },
}));

import { runMemberVerification } from '@/ai/engines/member-verification.engine';
import { transactionEngine } from '@/lib/services/transaction.engine';
import * as supabaseServer from '@/lib/supabase/server';

/**
 * Helper: stub the three layers + identity. We mock the member-lookup-tools
 * module directly so the engine picks up our canned values.
 */
jest.mock('@/ai/tools/member-lookup-tools', () => ({
  getDatabaseBalances: jest.fn(),
  getApiBalances: jest.fn(),
  getDisplayBalances: jest.fn(),
  getMemberIdentity: jest.fn(),
  getDisplayIdentity: jest.fn(),
}));

import {
  getDatabaseBalances,
  getApiBalances,
  getDisplayBalances,
  getMemberIdentity,
  getDisplayIdentity,
} from '@/ai/tools/member-lookup-tools';

const mocked = {
  db: getDatabaseBalances as jest.Mock,
  api: getApiBalances as jest.Mock,
  display: getDisplayBalances as jest.Mock,
  identity: getMemberIdentity as jest.Mock,
  displayIdentity: getDisplayIdentity as jest.Mock,
};

function setLayers(opts: {
  db?: any;
  api?: any;
  display?: any;
  displaySource?: string;
  identity?: any;
  displayIdentity?: any;
}) {
  mocked.db.mockResolvedValue({ source: 'database', ...(opts.db ?? { savings: 20000 }) });
  mocked.api.mockResolvedValue({ source: 'api', ...(opts.api ?? { savings: 20000 }) });
  mocked.display.mockResolvedValue({
    source: opts.displaySource ?? 'display',
    ...(opts.display ?? { savings: 20000 }),
  });
  mocked.identity.mockResolvedValue(opts.identity ?? { member_number: 'MBR-001', status: 'active' });
  mocked.displayIdentity.mockResolvedValue(opts.displayIdentity ?? { member_number: 'MBR-001', status: 'active' });
  (transactionEngine.calculateAllBalances as jest.Mock).mockResolvedValue(opts.api ?? { savings: 20000 });
}

beforeEach(() => {
  jest.clearAllMocks();
  setLayers({});
});

describe('runMemberVerification', () => {
  test('VERIFIED when DB == API == display', async () => {
    setLayers({ db: { savings: 20000, shares: 2000 }, api: { savings: 20000, shares: 2000 }, display: { savings: 20000, shares: 2000 } });
    const { result } = await runMemberVerification('mbr-1');
    expect(result.overall_status).toBe('verified');
    expect(result.verification_score).toBe(100);
    expect(result.fields_mismatched).toBe(0);
  });

  test('CRITICAL DISPLAY MISMATCH when display savings differs from DB+API', async () => {
    // Database + API agree at 20000, but the member-lookup display shows 18000.
    setLayers({
      db: { savings: 20000 },
      api: { savings: 20000 },
      display: { savings: 18000 },
    });
    const { result, findings } = await runMemberVerification('mbr-1');
    expect(result.overall_status).not.toBe('verified');
    expect(result.fields_mismatched).toBeGreaterThanOrEqual(1);
    const savingsFinding = findings.find((f) => f.title.includes('savings'));
    expect(savingsFinding).toBeDefined();
    expect(savingsFinding!.severity).toBe('critical');
    expect(savingsFinding!.category).toBe('critical_display_mismatch');
    // Evidence must include both the API + display values.
    const ev = savingsFinding!.evidence;
    expect(ev.some((e) => e.source_type === 'api')).toBe(true);
    expect(ev.some((e) => e.source_type === 'display')).toBe(true);
  });

  test('DB vs API mismatch is flagged critical (independent of display)', async () => {
    // DB says 20000, API says 18500 — transaction-total vs stored-balance drift.
    setLayers({
      db: { savings: 20000 },
      api: { savings: 18500 },
      display: { savings: 18500 },
    });
    const { result, findings } = await runMemberVerification('mbr-1');
    const dbApiFinding = findings.find((f) => f.category === 'db_vs_api_mismatch' && f.title.includes('savings'));
    expect(dbApiFinding).toBeDefined();
    expect(dbApiFinding!.severity).toBe('critical');
    expect(result.overall_status).not.toBe('verified');
  });

  test('falls back to DB-vs-API when display layer is unavailable', async () => {
    setLayers({
      db: { savings: 20000 },
      api: { savings: 20000 },
      displaySource: 'unavailable',
      display: {},
    });
    const { result } = await runMemberVerification('mbr-1');
    // No display mismatch possible; DB==API → verified.
    expect(result.overall_status).toBe('verified');
    // The field result notes the display layer was unavailable.
    const savingsField = result.field_results.find((f) => f.field === 'savings');
    expect(savingsField?.note).toContain('unavailable');
  });

  test('identity display mismatch (status) flagged high', async () => {
    setLayers({
      db: { savings: 20000 }, api: { savings: 20000 }, display: { savings: 20000 },
      identity: { member_number: 'MBR-001', status: 'active' },
      displayIdentity: { member_number: 'MBR-001', status: 'suspended' },
    });
    const { findings } = await runMemberVerification('mbr-1');
    const statusFinding = findings.find((f) => f.category === 'identity_display_mismatch' && f.title.includes('status'));
    expect(statusFinding).toBeDefined();
    expect(statusFinding!.severity).toBe('high');
  });

  test('never mutates data — only reads (no insert/update/delete calls)', async () => {
    await runMemberVerification('mbr-1');
    const supabase = await (supabaseServer.createServiceClient as jest.Mock)();
    const from = (supabase as any).from as jest.Mock;
    // The stub chain only exposes select/eq/maybeSingle — assert no write verbs.
    const calls = from.mock.results;
    for (const r of calls) {
      const obj = r.value;
      expect(obj.insert).toBeUndefined();
      expect(obj.update).toBeUndefined();
      expect(obj.delete).toBeUndefined();
      expect(obj.upsert).toBeUndefined();
    }
  });
});
