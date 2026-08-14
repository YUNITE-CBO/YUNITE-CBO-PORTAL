# YUNITE Pamoja CBO — Member Lookup Portal

A **futuristic, secure, public-facing** member verification and account
portal for YUNITE Pamoja CBO. It is a **standalone Next.js 14 (App Router)**
app that lives inside the YUNITE-CBO-PORTAL repository but deploys
**independently to Vercel**. It **consumes the existing YUNITE backend APIs**
(`/api/v1`) — it does **not** rebuild or replace any backend logic.

> The backend remains the single source of truth for all data and
> calculations (balances, shares, loan interest, fine totals). This portal
> only transports and presents that data securely.

---

## ✨ Features

- **Public home page** — live clock (time/date/day), upcoming meetings, a
  rotating message from YUNITE, daily motivational messages, and a prominent
  "Access my member account" call-to-action.
- **Secure member verification** — three public credentials (first name,
  phone, national ID number) verified **server-side** against real backend
  member data. No password required; no credential ever tells you which one
  was wrong.
- **Short-lived signed sessions** — verification issues an httpOnly, Secure,
  SameSite=Lax JWT cookie (jose/HS256) binding only the `member_id`. The
  browser cannot tamper with it, and one member cannot read another's data.
- **Member dashboard** — overview, savings & shares, contributions, welfare,
  loans (with repayment progress), fines, full transaction ledger, statement
  of account, notifications, read-only profile, and support.
- **Loading / empty / error states everywhere** — the portal never fabricates
  data; missing backend capabilities surface as clear, honest messages
  (see `API_GAPS.md`).
- **Futuristic UI** — dark, glassy, aurora-lit interface in the YUNITE brand
  palette (navy `#0B2A4A` + luminous green `#22C55E`), fully responsive.

---

## 🔐 Security architecture (BFF pattern)

```
Browser  ──cookie (signed JWT, member_id only)──►  Next.js server route (BFF)
                                                        │  uses YUNITE_API_KEY (server env, never shipped)
                                                        ▼
                                                YUNITE backend /api/v1
```

- The **YUNITE API key** lives **only** in this app's server environment
  (`YUNITE_API_KEY`). It is never sent to the browser, never placed in URLs,
  and never logged.
- The browser only ever holds a **short-lived signed session cookie** that
  binds the verified `member_id`. Every member-data request resolves the
  member from that JWT server-side — never from a URL path or client state —
  so **cross-member access is impossible**.
- Sensitive fields (e.g. ID number) are **masked** in the profile view.
- Logout clears the cookie. Sessions expire automatically (default 30 min).

---

## 🚀 Getting started (local)

```bash
cd member-lookup-frontend
cp .env.example .env.local      # then fill in real values
npm install
npm run dev                    # http://localhost:3000
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `YUNITE_API_BASE_URL` | Base URL of the existing YUNITE backend (no trailing slash). |
| `YUNITE_API_KEY` | A live YUNITE API key with read scopes (server-only, never exposed). |
| `MEMBER_SESSION_SECRET` | Long random secret for signing member session JWTs (`openssl rand -hex 32`). |
| `MEMBER_SESSION_TTL_SECONDS` | Session lifetime (default `1800` = 30 min). |
| `NEXT_PUBLIC_APP_URL` | Public URL of this portal (optional, for metadata). |

---

## ▲ Deploy to Vercel (independent of the main app)

1. In Vercel, create a **new project** and import the GitHub repo.
2. Set **Root Directory** to `member-lookup-frontend`.
3. Framework preset: **Next.js** (auto-detected). Build: `next build`.
4. Add the environment variables above under **Settings → Environment
   Variables**.
5. Deploy. The portal is now a separate Vercel deployment from the main
   YUNITE app.

> The API key used by this portal must be granted the read scopes listed in
> `API_GAPS.md`. To enable the home-page meetings list, additionally expose
> `/api/v1/meetings` and grant `meetings.read` (see `API_GAPS.md`).

---

## 🗂️ Project structure

```
member-lookup-frontend/
├── src/
│   ├── app/
│   │   ├── api/                 # BFF routes (server-side, hold the API key)
│   │   │   ├── auth/verify      # POST verification → sets session cookie
│   │   │   ├── auth/logout      # POST clears the cookie
│   │   │   ├── member/*         # member-scoped data routes (guarded)
│   │   │   ├── meetings         # public upcoming meetings (graceful)
│   │   │   └── org-info         # public org contact info
│   │   ├── dashboard/           # authenticated member area (guarded)
│   │   ├── page.tsx             # public home page
│   │   ├── layout.tsx
│   │   ├── error.tsx / not-found.tsx
│   ├── components/              # UI components (clock, access card, dashboard)
│   ├── lib/
│   │   ├── api/                 # server-only API client, services, types
│   │   ├── auth/                # session (jose JWT)
│   │   ├── format.ts            # display helpers (currency/date/status)
│   │   └── home-content.ts      # motivational + org messages
│   └── middleware.ts            # protects /dashboard
├── API_GAPS.md                  # backend gaps + recommended changes
├── .env.example
└── package.json
```

---

## 🛠️ Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build. |
| `npm run start` | Start the production server. |
| `npm run lint` | Run Next.js lint. |
| `npm run type-check` | `tsc --noEmit` type check. |

---

## 📋 Backend gaps

See [`API_GAPS.md`](./API_GAPS.md) for the full list of backend capabilities
this portal needs that are not yet exposed via the API-key gateway, and the
recommended backend changes to enable them. Each gap is handled gracefully in
the UI.
