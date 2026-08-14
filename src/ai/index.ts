/**
 * YUNITE AI Intelligence Engine — public surface.
 *
 * The database and deterministic YUNITE business engines remain the source of
 * truth. AI providers (Gemini, OpenRouter) investigate the system through
 * controlled, read-only tools and produce reports. AI never writes business
 * data and never receives raw credentials/PII.
 *
 * Import the orchestrator + engines from here; never import provider internals
 * directly (provider abstraction).
 */

export type {
  InvestigationScope, Severity, Confidence, ProviderName, VerificationStatus,
  EvidenceItem, Finding, ProviderReport, ProviderRunResult, ComparisonResult,
  VerificationFieldResult, MemberVerificationResult, ProviderHealthSnapshot,
  InvestigationContext,
} from './types';

export { runInvestigation, shouldAlertCritical, type InvestigationResult } from './investigation.engine';
export { compareReports } from './comparison.engine';
export { computeScore, buildFinalReport, type ScoreResult, type FinalReport } from './report.engine';
export { sanitizeForAi } from './tools';
export { geminiProvider, openRouterProvider } from './providers';
export { getHealth, snapshotHealth } from './providers/health-monitor';
export { investigateWithFailover } from './providers/failover';
export {
  runDatabaseConsistency, runCrossModuleConsistency, runBusinessRuleConsistency,
  runApiConsistency, runFinancialConsistency, runMemberVerification,
} from './engines';
export { alertCriticalFindings } from './alerting.service';
export {
  listInvestigations, getInvestigation, listReports, getReport, getComparison,
  listProviderRuns, getLatestHealth, getVerificationResult,
  listSchedules, upsertSchedule, deleteSchedule, listDueSchedules, markScheduleRun,
} from './persistence';
