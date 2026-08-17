import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * fetch wrapper that bypasses Next.js's data cache.
 *
 * Next.js 14 app-router caches every `fetch()` GET with `force-cache` by
 * default. @supabase/ssr issues its REST requests through the global `fetch`,
 * so reads (balances, totals, lookups) returned stale cached results and
 * writes (POST an expenditure, deposit, …) never invalidated them. The symptom
 * was that recording a Unity Fund expenditure did not reduce the displayed
 * actual balance until the `.next` cache was cleared. Routing these requests
 * through a `no-store` fetch makes every read hit the database live.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            );
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );
}
