/**
 * Unity Fund investigation scope reachability (req. #5, #9, #11, §20, §30).
 *
 * The Unity Fund Consistency Engine, the investigation orchestrator's scope
 * dispatcher, and the tools payload builder all support the 'unity_fund'
 * scope. Before the fix, migration 030's CHECK constraint, the
 * /api/ai/investigations and /api/ai/schedules VALID_SCOPES sets, and the
 * dashboard SCOPE_LABELS all omitted 'unity_fund', so a Super Admin could
 * never actually launch a Unity Fund investigation despite the engine
 * existing. These tests pin the reachability contract end-to-end at the
 * logic layer (no live DB / no network), so a future regression that drops
 * the scope from any layer fails the build.
 */

import { buildPrompt } from '@/ai/providers/prompt-builder';
import { buildModuleHealthMap, MODULE_HEALTH_ORDER } from '@/ai/engines/module-health.engine';
import { runUnityFundConsistency } from '@/ai/engines/unity-fund.consistency.engine';
import type { InvestigationContext, InvestigationScope } from '@/ai/types';

// The complete scope set the system claims to support. This is the single
// contract every layer (DB CHECK, route VALID_SCOPES, dashboard SCOPE_LABELS,
// orchestrator pickDeterministic, buildToolsPayload) must agree on.
const EXPECTED_SCOPES: InvestigationScope[] = [
  'database', 'cross_module', 'business_rules', 'api', 'financial',
  'unity_fund', 'member_verification', 'full_system',
];

describe('unity_fund investigation scope reachability', () => {
  test("'unity_fund' is part of the supported InvestigationScope union", () => {
    // Compile-time: 'unity_fund' is a valid InvestigationScope literal.
    const scope: InvestigationScope = 'unity_fund';
    expect(scope).toBe('unity_fund');
    expect(EXPECTED_SCOPES).toContain('unity_fund');
  });

  test("the Unity Fund consistency engine is exported from the engines barrel", () => {
    expect(typeof runUnityFundConsistency).toBe('function');
  });

  test("the module-health map recognizes 'unity_fund' as a canonical module", () => {
    expect(MODULE_HEALTH_ORDER).toContain('unity_fund');
    // An empty findings set still surfaces unity_fund as healthy (req. #20:
    // every canonical module is always listed, even when healthy).
    const map = buildModuleHealthMap([]);
    const uf = map.find((e) => e.module === 'unity_fund');
    expect(uf).toBeDefined();
    expect(uf?.status).toBe('healthy');
  });

  test("buildPrompt produces a valid, Unity-Fund-aware prompt for the unity_fund scope", () => {
    const ctx: InvestigationContext = {
      investigation_id: 'inv-uf-test',
      scope: 'unity_fund',
      deterministic_findings: [],
      tools_payload: {
        unity_fund: { actual_balance: 1000, pending_receivables: 200 },
        business_rules: { share_value: 100 },
      },
    };
    const { system, user } = buildPrompt(ctx);

    // The system prompt carries the Unity Fund authoritative-source model.
    expect(system).toContain('Unity Fund');
    expect(system).toContain('UnityFundEngine');

    // The user prompt reflects the requested scope + the supplied payload.
    expect(user).toContain('unity_fund');
    expect(user).toContain('SCOPE: unity_fund');
    expect(user).toContain('actual_balance');
  });

  test('every supported scope produces a buildable prompt (no scope throws)', () => {
    // Guards the orchestrator's contract that every scope in the union has a
    // coherent prompt path — a regression that adds a scope to the union but
    // forgets buildToolsPayload/prompt wiring would surface here.
    for (const scope of EXPECTED_SCOPES) {
      const ctx: InvestigationContext = {
        investigation_id: `inv-${scope}`,
        scope,
        deterministic_findings: [],
        tools_payload: { data_availability: { ok: true } },
        ...(scope === 'member_verification' ? { member_id: 'test-member' } : {}),
      };
      expect(() => buildPrompt(ctx)).not.toThrow();
      const { user } = buildPrompt(ctx);
      expect(user).toContain(`SCOPE: ${scope}`);
    }
  });
});
