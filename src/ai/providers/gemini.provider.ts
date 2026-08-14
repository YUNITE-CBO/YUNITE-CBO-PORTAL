/**
 * Gemini AI provider (Google Generative Language API).
 *
 * Reads GEMINI_API_KEY / GEMINI_MODEL from the environment server-side.
 * The key is NEVER exposed to the frontend and NEVER logged. Investigates
 * the SAME context as OpenRouter using the shared prompt builder; only the
 * HTTP transport is provider-specific.
 *
 * Network contract:
 *  - Uses Google's generateContent endpoint with responseMimeType JSON.
 *  - A generation may legitimately take several seconds; the failover
 *    manager's "unavailability" timeout (which triggers fallback) is a fast
 *    probe, NOT a hard cap on this method's duration.
 */

import type { AiProvider } from './provider';
import type { ProviderName, ProviderReport, ProviderRunResult } from '../types';
import type { InvestigationContext } from '../types';
import { buildPrompt } from './prompt-builder';
import { extractJson, normalizeReport } from './response-parser';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

export class GeminiProvider implements AiProvider {
  readonly name: ProviderName = 'gemini';

  private get apiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  private get model(): string {
    return process.env.GEMINI_MODEL || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async ping(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    if (!this.apiKey) return { ok: false, latency_ms: 0, error: 'not configured' };
    const start = Date.now();
    try {
      // Minimal list-models probe (cheap, no tokens consumed).
      const url = `${GEMINI_BASE}/models?key=${encodeURIComponent(this.apiKey)}&pageSize=1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
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
      const err = new Error('Gemini API key not configured');
      (err as any).code = 'not_configured';
      throw err;
    }
    const { system, user } = buildPrompt(ctx);
    const start = Date.now();

    const url = `${GEMINI_BASE}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
      const err = new Error(`Gemini HTTP ${res.status}: ${errorBody.slice(0, 200)}`);
      (err as any).code = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'unavailable' : 'error';
      throw err;
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text)
        .filter(Boolean)
        .join('\n') ?? '';

    if (!text) {
      const err = new Error('Gemini returned an empty response');
      (err as any).code = 'invalid_response';
      throw err;
    }

    const parsed = extractJson(text);
    if (parsed === null) {
      const err = new Error('Gemini response was not valid JSON');
      (err as any).code = 'invalid_response';
      throw err;
    }

    return normalizeReport(parsed, ctx, 'gemini', this.model, latency_ms);
  }
}

export const geminiProvider = new GeminiProvider();
export type { ProviderRunResult };
