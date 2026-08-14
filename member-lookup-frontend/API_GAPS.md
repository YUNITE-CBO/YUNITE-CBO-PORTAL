# YUNITE API gaps relevant to the Member Lookup Portal

This document records backend capabilities the Member Lookup Portal needs that
the **current** YUNITE backend (as inspected on 2026-08-13) does **not** yet
provide through the API-key gateway. Each gap is handled gracefully in the
frontend (clear messaging, never fabricated data) and will light up
automatically when the backend is extended.

> All findings below were verified against the LIVE backend using a real API
> key with read scopes. The frontend consumes ONLY real backend data.

## 1. Member verification endpoint (no dedicated endpoint)

- **Need:** verify a member by `phone` + `id_number` + `first_name`.
- **Backend today:** `/api/v1/members/lookup?q=` is a free-text *search*;
  `POST /api/v1/auth/login` authenticates portal *users* (email + password),
  not members. There is no member-verification endpoint.
- **Workaround (implemented):** the portal's server-side BFF
  (`/api/auth/verify`) fetches real member records with the server-only API
  key and matches all three fields **on the server** (never in the browser).
  Failure reveals nothing about which field was wrong.
- **Recommended backend change:** add `POST /api/v1/members/verify`
  (`members.verify` scope) that performs the three-field match server-side
  and returns a minimal, verified member identity. This removes the
  client-portal's need to fetch the member list.

## 2. Meetings through the API-key gateway

- **Need:** upcoming meetings for the public home page.
- **Backend today:** meetings are exposed only at `GET /api/meetings`
  (non-v1), which requires a **portal session cookie** — NOT the API key.
  There is **no** `/api/v1/meetings` endpoint and no `meetings.read` scope.
- **Workaround (implemented):** `GET /api/meetings` (BFF) tries
  `/api/v1/meetings` defensively and returns `available: false` with a
  graceful note when it is unavailable. **No meetings are fabricated.**
- **Recommended backend change:** (a) add `GET /api/v1/meetings`
  (`meetings.read` scope) and `GET /api/v1/meetings/{id}`; (b) grant
  `meetings.read` to the API client used by this portal. The home page and
  any future meetings tab will then populate automatically.

## 3. Statement generation is broken on the live DB

- **Need:** a member statement of account.
- **Backend today:** `GET /api/v1/members/{id}/statement?type=savings`
  returns **HTTP 500** ("Internal server error") on the live database.
- **Workaround (implemented):** the `/api/member/statement` BFF attempts the
  authoritative endpoint; on a 5xx it degrades gracefully, returning the
  real balances (from `/balances`, which works) + recent transactions, with a
  banner explaining the official statement is temporarily unavailable.
- **Recommended backend change:** fix the statement service/endpoint so it
  succeeds for members with and without prior transactions.

## 4. Contributions list is not member-filterable

- **Need:** a single member's contribution history.
- **Backend today:** `GET /api/v1/contributions` accepts only `campaign_id`
  — there is no `member_id` filter, so it returns ALL members' contributions.
- **Workaround (implemented):** contribution history is sourced from
  `GET /api/v1/transactions?member_id=…&account_type=contributions`, which
  IS member-filterable and is the underlying ledger (source of truth). The
  balances come from `/balances`.
- **Recommended backend change:** add `member_id` to the contributions list
  endpoint (or document transactions as the canonical per-member source).

## 5. Support tickets

- **Need:** a way for members to submit issues online.
- **Backend today:** there is no support/ticket endpoint in the API manifest.
- **Workaround (implemented):** the Support page surfaces the org contact
  details (from `/api/v1/settings`) and FAQ, and clearly states that an
  in-app ticket system is not yet available. **No fake submission UI.**
- **Recommended backend change:** add a `support` module
  (`POST /api/v1/support/tickets`, `GET /api/v1/support/tickets`) with a
  `tickets` table, scoped to the requesting member.

## Scope summary for the portal's API client

The portal's server-side API key currently needs (and was verified to have)
these read scopes: `members.read`, `transactions.read`, `loans.read`,
`fines.read`, `contributions.read`, `welfare.read`, `notifications.read`,
`statements.read`, `dashboard.read`, `settings.read`. To enable meetings,
add `meetings.read`.
