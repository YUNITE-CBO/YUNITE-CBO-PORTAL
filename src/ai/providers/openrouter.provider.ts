/**
 * OpenRouter AI provider (OpenAI-compatible chat completions API).
 *
 * Reads OPENROUTER_API_KEY / OPENROUTER_BASE_URL / OPENROUTER_MODEL from the
 * environment server-side. The key is NEVER exposed to the frontend and NEVER
 * logged. Investigates the SAME context as Gemini using the shared prompt
 * builder; only the HTTP transport is provider-specific.
 *
 * Network contract:
 *  - Uses the OpenAI-compatible /chat/completions endpoint with
 *    response_format json_object (when supported).
 *  - A generation may legitimately take several seconds; the failover
 *    manager's "unavailability" timeout (which triggers fallback) is a fast
 *    probe, NOT a hard cap on this method's duration.
 */

import type { AiProvider } from './provider';
import type { ProviderName, ProviderReport } from '../types';
import type { InvestigationContext } from '../types';
import { buildPrompt } from './prompt-builder';
import { extractJson, normalizeReport } from './response-parser';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export class OpenRouterProvider implements AiProvider {
  readonly name: ProviderName = 'openrouter';

  private get apiKey(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  }

  private get baseUrl(): string {
    return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  private get model(): string {
    return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async ping(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.apiKey) return { ok: false, latency_ms: 0, error: 'not configured' };
    const start = Date.now();
    try {
      // Minimal auth check against the models list (cheap).
      const res = await fetch(`${this.baseUrl}/models?limit=1`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      const latency_ms = Date.now() - start;
      if (res.ok) return { ok: true, latency_ms };
      return { ok: false, latency_ms, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, latency_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async investigate(ctx: InvestigationContext): Promise<ProviderReport> {
    if (!this.apiKey) {
      const err = new Error('OpenRouter API key not configured');
      (err as any).code = 'not_configured';
      throw err;
    }
    const { system, user } = buildPrompt(ctx);
    const start = Date.now();

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // OpenRouter recommends an identifying header (not secret).
        'HTTP-Referer': 'https://yunite-cbo-portal.onrender.com',
        'X-Title': 'YUNITE AI Intelligence Engine',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const latency_ms = Date.now() - start;

    if (!res.ok) {
      let errorBody = '';
      try {
        errorBody = JSON.stringify(await res.json());
      } catch {
        /* ignore */
      }
      const err = new Error(`OpenRouter HTTP ${res.status}: ${errorBody.slice(0, 200)}`);
      (err as any).code = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'unavailable' : 'error';
      throw err;
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    if (!text) {
      const err = new Error('OpenRouter returned an empty response');
      (err as any).code = 'invalid_response';
      throw err;
    }

    const parsed = extractJson(text);
    if (parsed === null) {
      const err = new Error('OpenRouter response was not valid JSON');
      (err as any).code = 'invalid_response';
      throw err;
    }

    const usage = data?.usage;
    const report = normalizeReport(parsed, ctx, 'openrouter', this.model, latency_ms);
    report.report_json = {
      ...report.report_json,
      ...(usage ? { _usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens } } : {}),
    };
    return report;
  }
}

export const openRouterProvider = new OpenRouterProvider();
