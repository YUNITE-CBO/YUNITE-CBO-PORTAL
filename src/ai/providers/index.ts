/**
 * AI provider barrel.
 */

export type { AiProvider } from './provider';
export { GeminiProvider, geminiProvider } from './gemini.provider';
export { OpenRouterProvider, openRouterProvider } from './openrouter.provider';
export { investigateWithFailover } from './failover';
export type { FailoverResult } from './failover';
export { getHealth, snapshotHealth } from './health-monitor';
export { buildPrompt } from './prompt-builder';
export { extractJson, normalizeReport } from './response-parser';
