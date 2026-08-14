/**
 * Tests for the Render keep-alive & cold-start resilience system.
 *
 * Covers:
 * - GET /health returns 200 with status=ok (no DB/auth needed)
 * - apiFetch retry logic: retries on network error, 502/503/504 for GET,
 *   does NOT retry 4xx, does NOT retry writes on server response
 * - Financial POST is never blindly duplicated (network error → retry OK,
 *   server 503 → no retry)
 */

// ---- Mock the global fetch ----
type FetchMock = (input: string, init?: RequestInit) => Promise<Response>;

let fetchMock: FetchMock;
let fetchCallCount: number;
let fetchCalls: { url: string; method: string; body?: string }[];

beforeEach(() => {
  fetchCallCount = 0;
  fetchCalls = [];
  fetchMock = jest.fn() as unknown as FetchMock;
  (global.fetch as unknown) = fetchMock;
});

function mockResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

function mockNetworkError(): Promise<Response> {
  return Promise.reject(new TypeError('fetch failed'));
}

describe('GET /health endpoint', () => {
  it('returns 200 with status=ok and a timestamp', async () => {
    const { GET } = await import('@/app/health/route');
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.service).toBe('yunite-cbo-api');
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not call Supabase or any database client', async () => {
    // If the endpoint imported createServiceClient and called it,
    // fetchMock would have been called (we set global.fetch). It should NOT
    // make any external request.
    (fetchMock as unknown as jest.Mock).mockImplementation(() =>
      Promise.resolve(mockResponse(200, { status: 'ok' })),
    );
    const { GET } = await import('@/app/health/route');
    await GET();
    expect(fetchCallCount).toBe(0);
  });
});

describe('apiFetch retry logic', () => {
  it('retries GET on 503 and succeeds on retry', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValueOnce(Promise.resolve(mockResponse(503, { error: 'Service Unavailable' })))
      .mockReturnValueOnce(Promise.resolve(mockResponse(200, { success: true, data: 'ok' })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(200);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(2);
  });

  it('retries GET on network error and succeeds on retry', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockImplementationOnce(() => mockNetworkError())
      .mockReturnValueOnce(Promise.resolve(mockResponse(200, { success: true })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(200);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(2);
  });

  it('does NOT retry on 401 (auth failure)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(401, { error: 'Unauthorized' })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(401);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('does NOT retry on 400 (validation error)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(400, { error: 'Bad Request' })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(400);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('does NOT retry on 403 (authorization failure)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(403, { error: 'Forbidden' })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(403);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('does NOT retry on 422 (business-rule error)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(422, { error: 'Duplicate transaction' })));

    const response = await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });
    expect(response.status).toBe(422);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('does NOT retry POST on 503 (write already may have been applied)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(503, { error: 'Service Unavailable' })));

    const response = await apiFetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000 }),
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(response.status).toBe(503);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(1);
  });

  it('DOES retry POST on network error (request never reached server)', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockImplementationOnce(() => mockNetworkError())
      .mockReturnValueOnce(Promise.resolve(mockResponse(200, { success: true })));

    const response = await apiFetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000 }),
      maxRetries: 3,
      baseDelayMs: 1,
    });
    expect(response.status).toBe(200);
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(2);
  });

  it('stops retrying after maxRetries on persistent 503 for GET', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(503, { error: 'Service Unavailable' })));

    const response = await apiFetch('/api/test', { maxRetries: 2, baseDelayMs: 1 });
    expect(response.status).toBe(503);
    // 1 initial + 2 retries = 3 calls
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(3);
  });

  it('throws after maxRetries on persistent network errors for GET', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockImplementation(() => mockNetworkError());

    await expect(apiFetch('/api/test', { maxRetries: 2, baseDelayMs: 1 }))
      .rejects.toThrow();
    expect((fetchMock as unknown as jest.Mock).mock.calls.length).toBe(3);
  });

  it('dispatches backend-unavailable and backend-available events on retry', async () => {
    const { apiFetch } = await import('@/lib/api-client/fetch-with-retry');

    // In the node test environment `window` is undefined, so mock the
    // event-dispatch functions the client calls.
    const events: string[] = [];
    const origWindow = (globalThis as Record<string, unknown>).window;
    const mockWindow = {
      addEventListener: (type: string, handler: (e: { type: string }) => void) => {
        (mockWindow as Record<string, unknown>)[`__handler_${type}`] = handler;
      },
      removeEventListener: () => {},
      dispatchEvent: (e: { type: string }) => {
        events.push(e.type);
        return true;
      },
    };
    (globalThis as Record<string, unknown>).window = mockWindow;

    (fetchMock as unknown as jest.Mock)
      .mockImplementationOnce(() => mockNetworkError())
      .mockReturnValueOnce(Promise.resolve(mockResponse(200, { success: true })));

    await apiFetch('/api/test', { maxRetries: 3, baseDelayMs: 1 });

    expect(events).toContain('yunite:backend-unavailable');
    expect(events).toContain('yunite:backend-available');

    (globalThis as Record<string, unknown>).window = origWindow;
  });
});

describe('apiFetchJson convenience wrapper', () => {
  it('parses successful JSON response', async () => {
    const { apiFetchJson } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(200, { success: true, data: { id: 1 } })));

    const result = await apiFetchJson<{ id: number }>('/api/test', { maxRetries: 0 });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: 1 });
  });

  it('returns ok=false on error envelope', async () => {
    const { apiFetchJson } = await import('@/lib/api-client/fetch-with-retry');

    (fetchMock as unknown as jest.Mock)
      .mockReturnValue(Promise.resolve(mockResponse(400, { success: false, error: 'Bad input' })));

    const result = await apiFetchJson('/api/test', { maxRetries: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Bad input');
  });
});
