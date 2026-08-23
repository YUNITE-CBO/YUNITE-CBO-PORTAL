/**
 * Support ticket system tests.
 *
 * Guards:
 *  1. Migration 046 static guarantees (table, CASCADE FK so permanent member
 *     deletion keeps working, category/status CHECK lists matching the service
 *     constants, the three notification templates).
 *  2. Ticket reference format (SUP-YYYYMMDD-XXXX).
 *  3. The v1 gateway manifest exposes support.read / support.create as
 *     grantable scopes (the member-lookup portal's API key needs them).
 *  4. The permanent member deletion engine knows about support_tickets.
 *
 * Pure static / pure-function checks — no database required.
 */

import fs from 'fs';
import path from 'path';

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => {
    throw new Error('must not touch the database');
  },
}));

import { ENDPOINTS } from '@/lib/api/manifest';
import { parseScopeList, isGrantableScope } from '@/lib/api/scopes';
import {
  generateTicketReference,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
} from '@/lib/services/support-ticket.service';
import { MEMBER_DEPENDENCY_MAP } from '@/lib/services/member-deletion.service';

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '046_support_tickets.sql'),
  'utf8',
);

describe('support ticket reference', () => {
  it('matches SUP-YYYYMMDD-XXXX', () => {
    const ref = generateTicketReference(new Date('2026-08-23T10:00:00Z'));
    expect(ref).toMatch(/^SUP-20260823-[0-9A-F]{8}$/);
  });

  it('is unique per call', () => {
    expect(generateTicketReference()).not.toBe(generateTicketReference());
  });
});

describe('migration 046 static guarantees', () => {
  it('creates the support_tickets table', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS support_tickets/);
  });

  it('member_id FK is ON DELETE CASCADE (keeps permanent deletion working)', () => {
    expect(MIGRATION).toMatch(/member_id UUID NOT NULL REFERENCES members\(id\) ON DELETE CASCADE/);
  });

  it('category CHECK matches the service constants exactly', () => {
    for (const c of SUPPORT_TICKET_CATEGORIES) {
      expect(MIGRATION).toContain(`'${c}'`);
    }
  });

  it('status CHECK matches the service constants exactly', () => {
    for (const s of SUPPORT_TICKET_STATUSES) {
      expect(MIGRATION).toContain(`'${s}'`);
    }
  });

  it('seeds the member + admin + update templates', () => {
    expect(MIGRATION).toContain("'support.ticket.received'");
    expect(MIGRATION).toContain("'admin.support_ticket_received'");
    expect(MIGRATION).toContain("'support.ticket.updated'");
  });

  it('ticket_reference is UNIQUE (idempotent double-submit protection)', () => {
    expect(MIGRATION).toMatch(/ticket_reference TEXT NOT NULL UNIQUE/);
  });
});

describe('v1 gateway manifest', () => {
  it('declares the support endpoints', () => {
    const ids = new Set(ENDPOINTS.map((e) => e.id));
    expect(ids.has('support.list')).toBe(true);
    expect(ids.has('support.create')).toBe(true);
  });

  it('support scopes are grantable to API clients (member portal)', () => {
    expect(isGrantableScope('support.read')).toBe(true);
    expect(isGrantableScope('support.create')).toBe(true);
    const parts = parseScopeList(['support.read', 'support.create']);
    expect(parts).toEqual([
      { module: 'support', action: 'read' },
      { module: 'support', action: 'create' },
    ]);
  });
});

describe('permanent member deletion', () => {
  it('knows about support_tickets as a cascade dependency', () => {
    const entry = MEMBER_DEPENDENCY_MAP.find((d) => d.table === 'support_tickets');
    expect(entry).toBeDefined();
    expect(entry?.strategy).toBe('cascade');
    expect(entry?.optional).toBe(true);
  });
});
