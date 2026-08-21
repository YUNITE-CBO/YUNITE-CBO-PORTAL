/**
 * Regression test for the Unity Fund "expenditure doesn't deduct balance" bug.
 *
 * Root cause: Next.js 14 app-router caches every `fetch()` GET with
 * `force-cache` by default. @supabase/ssr issues its REST requests through the
 * global `fetch`, so server-side reads returned stale cached results and
 * writes (POST an expenditure, deposit, …) never invalidated them. Recording a
 * Unity Fund expenditure therefore did not change the displayed actual
 * balance until the `.next` data cache was cleared.
 *
 * Fix: `src/lib/supabase/server.ts` wraps the supabase client's fetch with a
 * `cache: 'no-store'` fetch so every read hits the database live. This test
 * locks that in by asserting the supabase client factory actually configures a
 * no-store fetch and that the wrapper forwards `cache: 'no-store'` on every
 * request (overriding any caller-supplied cache directive).
 */

export {};

// Capture the options passed to createServerClient so we can assert on the
// configured fetch without needing a request context (createServiceClient does
// not call cookies(), unlike createClient()).
let capturedOptions: any = null;
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn((url: string, key: string, options: any) => {
    capturedOptions = options;
    return { url, key, options };
  }),
}));

import { createServiceClient } from '@/lib/supabase/server';

describe('supabase server client bypasses Next.js fetch cache (UF balance regression)', () => {
  it('configures a custom fetch on the service client', async () => {
    await createServiceClient();
    expect(capturedOptions).not.toBeNull();
    expect(typeof capturedOptions.global?.fetch).toBe('function');
  });

  it('forwards cache: no-store on every request', async () => {
    await createServiceClient();
    const fetchWrapper = capturedOptions.global.fetch as typeof fetch;

    const original = global.fetch;
    const recorded: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    global.fetch = jest.fn((input, init) => {
      recorded.push({ input, init });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;

    try {
      await fetchWrapper('https://example.supabase.co/rest/v1/unity_fund_expenditures?select=amount', {
        method: 'GET',
        headers: { apikey: 'k' },
      });
    } finally {
      global.fetch = original;
    }

    expect(recorded).toHaveLength(1);
    const call = recorded[0] as { input: RequestInfo | URL; init?: RequestInit };
    expect(call.init?.cache).toBe('no-store');
  });

  it('overrides a caller-supplied cache directive with no-store', async () => {
    await createServiceClient();
    const fetchWrapper = capturedOptions.global.fetch as typeof fetch;

    const original = global.fetch;
    let capturedInit: RequestInit | undefined;
    global.fetch = jest.fn((_input, init) => {
      capturedInit = init;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;

    try {
      // A caller (or a future regression) tries to force-cache the read.
      await fetchWrapper('https://example.supabase.co/rest/v1/transactions', {
        method: 'GET',
        cache: 'force-cache',
      } as RequestInit);
    } finally {
      global.fetch = original;
    }

    expect(capturedInit?.cache).toBe('no-store');
  });
});
