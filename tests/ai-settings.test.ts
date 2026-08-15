/**
 * AI Settings resolver — precedence tests.
 *
 * Verifies the Dual AI Mode resolution precedence:
 *   1. Explicit 'single'/'dual' always win (per-run override).
 *   2. 'auto' honors the DB `ai.dual_mode` setting (source of truth).
 *   3. 'auto' falls back to the AI_DUAL_MODE env var when the DB row is absent.
 *   4. 'auto' defaults to OFF (single) when both DB and env are unset.
 *
 * The configurationService is mocked so no DB/Supabase access occurs.
 */

jest.mock('@/lib/services/configuration.service', () => ({
  configurationService: {
    getSetting: jest.fn(),
    getMany: jest.fn(),
  },
}));

import { configurationService } from '@/lib/services/configuration.service';
import { resolveDualMode, isAiInvestigationsEnabled, isAiCriticalAlertsEnabled } from '@/ai/settings';

const mockedGetSetting = configurationService.getSetting as jest.MockedFunction<typeof configurationService.getSetting>;

afterEach(() => {
  jest.resetAllMocks();
  delete process.env.AI_DUAL_MODE;
});

describe('resolveDualMode precedence', () => {
  it("explicit 'dual' always resolves to dual (ignores DB + env)", async () => {
    mockedGetSetting.mockResolvedValue('false'); // DB says OFF
    process.env.AI_DUAL_MODE = 'false';
    expect(await resolveDualMode('dual')).toBe('dual');
  });

  it("explicit 'single' always resolves to single (ignores DB + env)", async () => {
    mockedGetSetting.mockResolvedValue('true'); // DB says ON
    process.env.AI_DUAL_MODE = 'true';
    expect(await resolveDualMode('single')).toBe('single');
  });

  it("'auto' honors DB setting when it is 'true' (DB is source of truth)", async () => {
    mockedGetSetting.mockResolvedValue('true');
    process.env.AI_DUAL_MODE = 'false'; // env disagrees — DB wins
    expect(await resolveDualMode('auto')).toBe('dual');
  });

  it("'auto' honors DB setting when it is 'false' (DB is source of truth)", async () => {
    mockedGetSetting.mockResolvedValue('false');
    process.env.AI_DUAL_MODE = 'true'; // env disagrees — DB wins
    expect(await resolveDualMode('auto')).toBe('single');
  });

  it("'auto' falls back to env when DB row is absent (null)", async () => {
    mockedGetSetting.mockResolvedValue(null);
    process.env.AI_DUAL_MODE = 'true';
    expect(await resolveDualMode('auto')).toBe('dual');
  });

  it("'auto' defaults to OFF (single) when both DB and env are unset", async () => {
    mockedGetSetting.mockResolvedValue(null);
    expect(await resolveDualMode('auto')).toBe('single');
  });

  it("'auto' treats non-true DB values as OFF", async () => {
    mockedGetSetting.mockResolvedValue('false');
    expect(await resolveDualMode('auto')).toBe('single');
  });

  it('falls back to env if DB read throws (non-fatal)', async () => {
    mockedGetSetting.mockRejectedValue(new Error('supabase down'));
    process.env.AI_DUAL_MODE = 'true';
    expect(await resolveDualMode('auto')).toBe('dual');
  });
});

describe('isAiInvestigationsEnabled (master switch)', () => {
  it('defaults ON when DB row is absent', async () => {
    mockedGetSetting.mockResolvedValue(null);
    expect(await isAiInvestigationsEnabled()).toBe(true);
  });

  it('returns the DB value when set', async () => {
    mockedGetSetting.mockResolvedValue('false');
    expect(await isAiInvestigationsEnabled()).toBe(false);
    mockedGetSetting.mockResolvedValue('true');
    expect(await isAiInvestigationsEnabled()).toBe(true);
  });

  it('defaults ON if DB read throws', async () => {
    mockedGetSetting.mockRejectedValue(new Error('down'));
    expect(await isAiInvestigationsEnabled()).toBe(true);
  });
});

describe('isAiCriticalAlertsEnabled', () => {
  it('defaults ON when DB row is absent', async () => {
    mockedGetSetting.mockResolvedValue(null);
    expect(await isAiCriticalAlertsEnabled()).toBe(true);
  });

  it('returns the DB value when set', async () => {
    mockedGetSetting.mockResolvedValue('false');
    expect(await isAiCriticalAlertsEnabled()).toBe(false);
  });
});
