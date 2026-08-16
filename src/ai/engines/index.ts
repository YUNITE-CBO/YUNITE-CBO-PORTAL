/**
 * Deterministic engines barrel.
 *
 * Each engine returns CONFIRMED findings (computed, not inferred). The
 * investigation engine runs these BEFORE invoking any AI, so deterministic
 * results never depend on AI availability.
 */

export { runDatabaseConsistency } from './database-consistency.engine';
export { runCrossModuleConsistency } from './cross-module.engine';
export { runBusinessRuleConsistency } from './business-rules.engine';
export { runApiConsistency } from './api-consistency.engine';
export { runFinancialConsistency } from './financial-consistency.engine';
export { runUnityFundConsistency } from './unity-fund.consistency.engine';
export { runMemberVerification, runMemberForensic } from './member-verification.engine';
export { buildModuleHealthMap } from './module-health.engine';
export { makeFinding, evidence, moneyDiff, kes, resetFindingSequence, type MakeFindingOpts } from './findings';
