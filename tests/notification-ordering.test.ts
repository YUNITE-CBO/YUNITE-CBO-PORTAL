/**
 * Tests for unread-first ordering in NotificationService.getForRecipient.
 *
 * Regression: notifications were ordered purely by created_at DESC, so read
 * and unread messages were interleaved by date and users had to scroll past
 * every read message to find an unread one. The list now orders unread
 * (read_at IS NULL) first, read below, newest-first within each group.
 *
 * The Supabase mock records the query-builder calls and applies the same
 * ordering semantics PostgREST would (order=read_at.desc.nullsfirst then
 * created_at.desc), so the test proves both the emitted query AND the
 * resulting row order.
 */

type Row = Record<string, any>;

let rows: Row[] = [];
let orderCalls: Array<[string, any]> = [];
let rangeCall: [number, number] | null = null;
let neqCalls: Array<[string, any]> = [];

function reset() {
  orderCalls = [];
  rangeCall = null;
  neqCalls = [];
  rows = [
    // interleaved by date: read, unread, read, unread (newest last)
    { id: 'n1', recipient_id: 'u1', recipient_type: 'user', status: 'read', read_at: '2026-08-20T09:00:00Z', created_at: '2026-08-19T08:00:00Z' },
    { id: 'n2', recipient_id: 'u1', recipient_type: 'user', status: 'delivered', read_at: null, created_at: '2026-08-20T08:00:00Z' },
    { id: 'n3', recipient_id: 'u1', recipient_type: 'user', status: 'read', read_at: '2026-08-22T09:00:00Z', created_at: '2026-08-21T08:00:00Z' },
    { id: 'n4', recipient_id: 'u1', recipient_type: 'user', status: 'sent', read_at: null, created_at: '2026-08-22T08:00:00Z' },
    // another recipient's unread notification must never leak in
    { id: 'n5', recipient_id: 'u2', recipient_type: 'user', status: 'sent', read_at: null, created_at: '2026-08-22T10:00:00Z' },
  ];
}

// Apply the recorded order specs to the filtered rows the way PostgREST
// would: each spec is a sort key, earlier specs take precedence.
function applyOrdering(filtered: Row[]): Row[] {
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    for (const [col, opts] of orderCalls) {
      const av = a[col] ?? null;
      const bv = b[col] ?? null;
      if (av === null && bv === null) continue;
      if (av === null) return opts.nullsFirst ? -1 : 1;
      if (bv === null) return opts.nullsFirst ? 1 : -1;
      if (av === bv) continue;
      const cmp = av < bv ? -1 : 1;
      return opts.ascending === false ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      const api: any = {
        select: () => api,
        eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
        neq: (col: string, val: any) => { neqCalls.push([col, val]); filters.push((r) => r[col] !== val); return api; },
        order: (col: string, opts?: any) => { orderCalls.push([col, opts || {}]); return api; },
        range: (from: number, to: number) => {
          rangeCall = [from, to];
          let result = applyOrdering(rows.filter((r) => filters.every((f) => f(r))));
          const total = result.length;
          result = result.slice(from, to + 1);
          return Promise.resolve({ data: result, count: total });
        },
      };
      return api;
    },
  }),
}));

import { notificationService } from '@/lib/services/notifications/notification.service';

export {};

beforeEach(reset);

describe('getForRecipient unread-first ordering', () => {
  it('orders unread (read_at NULL) before read, newest first within each group', async () => {
    const result = await notificationService.getForRecipient('u1', 'user');
    expect(result.notifications.map((n: Row) => n.id)).toEqual(['n4', 'n2', 'n3', 'n1']);
    // other recipient's rows never included
    expect(result.total).toBe(4);
  });

  it('emits read_at DESC NULLS FIRST before created_at DESC', async () => {
    await notificationService.getForRecipient('u1', 'user');
    expect(orderCalls).toEqual([
      ['read_at', { ascending: false, nullsFirst: true }],
      ['created_at', { ascending: false }],
    ]);
  });

  it('pagination range applies AFTER unread-first ordering (page 1 carries the unread)', async () => {
    const result = await notificationService.getForRecipient('u1', 'user', { limit: 2 });
    expect(rangeCall).toEqual([0, 1]);
    expect(result.notifications.map((n: Row) => n.id)).toEqual(['n4', 'n2']);
    expect(result.total).toBe(4);
  });

  it('unreadOnly still filters out read rows alongside the ordering', async () => {
    const result = await notificationService.getForRecipient('u1', 'user', { unreadOnly: true });
    expect(neqCalls).toContainEqual(['status', 'read']);
    expect(result.notifications.map((n: Row) => n.id)).toEqual(['n4', 'n2']);
  });
});
