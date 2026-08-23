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

## 2. Meetings through the API-key gateway — **CLOSED (backend migration 048)**

- **Need:** upcoming meetings for the public home page.
- **Backend now:** `GET /api/v1/meetings?upcoming=true` exists (manifest id
  `meetings.list`, scope `meetings.read`, minRole viewer). Migration 048
  auto-grants `meetings.read` to every active API client that is the
  member-lookup portal (`client_type = 'lookup'`) or already holds
  `members.read`. **Deploy step: run migration 048 in the Supabase SQL
  Editor** — until then the gateway returns 403 and the home page keeps the
  graceful "unavailable" note.
- **Behavior:** the portal BFF fetches real meetings from the gateway; on
  404/403 it degrades gracefully (never fabricates data).

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

## 5. Support tickets — IMPLEMENTED (migration 046)

- **Backend now provides:** `POST /api/v1/support/tickets` (`support.create`
  scope) and `GET /api/v1/support/tickets?member_id=` (`support.read` scope),
  backed by the `support_tickets` table (migration 046) and
  `supportTicketService`. Members receive a `support.ticket.received`
  confirmation (in-app + email) on submit; admins receive
  `admin.support_ticket_received`; status changes send `support.ticket.updated`.
  Staff manage tickets at `/dashboard/support-tickets` (session routes
  `GET /api/support/tickets`, `PATCH /api/support/tickets/[id]`).
- **Portal (implemented):** the Support page has a real "Submit a request"
  form (category/subject/message) via BFF `GET|POST /api/member/support`
  (member bound from the session JWT) + a "My requests" list showing status
  and the office's response.
- **Deploy:** run migrations 046 AND 047 in Supabase SQL Editor — 047
  auto-grants `support.read` + `support.create` to the portal's API client
  (any active `lookup`-type client or holder of `members.read`). Without
  047 the submit/list calls return 403 "API client lacks permission
  support.create".

## Scope summary for the portal's API client

The portal's server-side API key currently needs (and was verified to have)
these read scopes: `members.read`, `transactions.read`, `loans.read`,
`fines.read`, `contributions.read`, `welfare.read`, `notifications.read`,
`statements.read`, `dashboard.read`, `settings.read`. To enable meetings,
add `meetings.read`. For support tickets, add `support.read` +
`support.create`.
