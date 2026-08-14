# Render Free-Tier Keep-Alive & Cold-Start Resilience

## Overview

YUNITE's backend runs on Render Free Tier, which automatically sleeps the web
service after ~15 minutes of inactivity. This document describes the keep-alive
strategy and the cold-start resilience built into the frontend.

**This does not permanently defeat Render Free Tier sleeping.** Render's own
free-tier limitations still apply. The application remains functional if the
service sleeps — the cold-start retry mechanism handles recovery automatically.

## 1. Lightweight Health Endpoint

### `GET /health`

Returns HTTP 200 the instant the Next.js server process is listening. This
endpoint does NOT query Supabase, PostgreSQL, Gemini, OpenRouter, or any
external dependency. It represents **process is alive**, not system health.

```json
{
  "status": "ok",
  "service": "yunite-cbo-api",
  "timestamp": "2026-08-14T17:22:29Z"
}
```

- No authentication required
- No secrets, env vars, or DB info exposed
- No business logic executed
- Available immediately on server startup (does not wait for external deps)

### Existing `GET /api/health`

The older `/api/health` endpoint queries Supabase and reports database
connectivity. It still exists for internal system-health checks but is NOT
used as the Render health check. Deep system health (database, AI providers,
business rules) belongs to the YUNITE AI Intelligence Engine.

## 2. Render Health Check Configuration

`render.yaml` sets:

```yaml
healthCheckPath: /health
```

Render will call `/health` to determine if the service is up. Because this
endpoint never queries external dependencies, Render can detect the listening
port even if Supabase or AI providers are temporarily unavailable.

## 3. External Keep-Alive Monitor

The keep-alive request must originate **outside** the Render service. Do NOT
create an internal `setInterval()` or self-ping loop inside the application.

Configure an external uptime monitor (e.g., UptimeRobot, Pingdom, Better Stack,
or any cron-based HTTP pinger) to call:

```
GET https://YOUR-RENDER-SERVICE.onrender.com/health
```

approximately every **10 minutes**.

### Where to Configure

The production URL is **NOT** hard-coded in the application source. It must be
set in your external monitoring service's dashboard:

1. Sign up for a free uptime monitor (e.g., [UptimeRobot](https://uptimerobot.com))
2. Add a new HTTP monitor
3. Set the URL to: `https://<your-render-service-name>.onrender.com/health`
4. Set the monitoring interval to 10 minutes (or the closest free-tier option)
5. Set expected status code: 200

### Why External (Not Render Cron)

Render Cron Jobs require a paid plan. To maintain a zero-cost/free-tier setup,
the keep-alive ping comes from a free external uptime monitor, not a Render
Cron Service.

## 4. Frontend Cold-Start Resilience

### Main Portal (Next.js Dashboard)

The centralized `apiFetch` wrapper (`src/lib/api-client/fetch-with-retry.ts`)
handles cold-start recovery for all frontend modules:

- **Retries**: network failures, connection reset, timeout, 502/503/504
- **Does NOT retry**: 401, 403, 400, 422, business-rule errors, or any 4xx
- **Write operations** (POST/PUT/PATCH/DELETE): retry ONLY on network-level
  failure (request never reached the server). Never retries a server response
  because the write may have already been applied. Financial transactions are
  never blindly duplicated.
- **Exponential backoff**: 1s, 2s, 4s, 8s with jitter (max 4 attempts)

### Connection State (`BackendAvailabilityProvider`)

A global React context tracks backend availability separately from auth state:

| State | Meaning |
|-------|---------|
| `connected` | Backend is responding normally |
| `connecting` | Initial connection attempt in progress |
| `reconnecting` | Backend went unavailable, retrying |
| `offline` | Backend unreachable after all retries |

When the backend is waking, a non-alarming banner appears:

> "YUNITE backend is waking up. Reconnecting..."

It disappears automatically once the backend responds.

### Member Lookup Portal (`member-lookup-frontend`)

The member-lookup frontend has the same resilience:

- **Server-side `apiGet`** (`src/lib/api/client.ts`): retries with backoff on
  network errors and 502/503/504. This portal only performs GET reads — never
  mutates member data — so retries are always safe.
- **Client-side `useApi` hook** (`src/components/dashboard/useApi.ts`): retries
  with backoff and shows "Connecting to YUNITE…" instead of a hard error.
- Members are never told the server is sleeping. Infrastructure details are
  never exposed.

## 5. Separation of Health Concerns

| Concern | Mechanism |
|---------|-----------|
| Infrastructure health (process alive) | `GET /health` |
| Database health | Existing controlled DB health check |
| AI provider health | Gemini/OpenRouter provider monitoring |
| YUNITE system health | AI Intelligence Engine |

`/health` is deliberately minimal. The AI Intelligence Engine does NOT depend
on `/health` to determine database or AI provider health.

## 6. Deploy Checklist

1. Push to GitHub → Render auto-deploys
2. Confirm the service starts (check Render logs for `backend_started`)
3. Confirm Render detects the port (health check passes on `/health`)
4. Open `https://<your-service>.onrender.com/health` → confirm HTTP 200 + `status: ok`
5. In Render Dashboard → Settings → Health Check → set path to `/health` (if not auto-applied from `render.yaml`)
6. Configure an external uptime monitor to call `/health` every ~10 min
7. Test frontend cold-start recovery (stop the monitor, let it sleep, wake it, load the dashboard)

## 7. Important Limitation

This implementation does NOT claim to permanently defeat Render Free Tier
sleeping. The external monitor is only a keep-alive strategy. The application
must remain functional if the service sleeps — the cold-start retry mechanism
is therefore mandatory and is the primary defense.
