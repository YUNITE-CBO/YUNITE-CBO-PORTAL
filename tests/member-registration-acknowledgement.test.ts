/**
 * Tests for the member REGISTRATION acknowledgement flow (official
 * registration by an administrator, distinct from the pre-registration
 * submission acknowledgement covered in member-registration-submissions.test.ts):
 *
 *   - the member.registered event notifies ALL ADMINS (member.registered
 *     template, admin-facing copy) AND THE NEW MEMBER
 *     (member.registration_confirmation template, member-facing copy)
 *   - the member acknowledgement carries member_number + organization_name
 *   - the organization_name variable comes from settings (brand fallback)
 */

// --- Captures -------------------------------------------------------------
const sendFromTemplateCalls: {
  templateCode: string;
  recipient: { id: string; type: string; email?: string; name: string };
  variables: Record<string, unknown>;
}[] = [];

const adminRows = [
  { id: 'u-admin', full_name: 'Admin One', email: 'admin@yunite.test' },
  { id: 'u-super', full_name: 'Super Admin', email: 'super@yunite.test' },
];
const memberRow = {
  id: 'm-new',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '0712345678',
};
let orgNameSetting: string | null = 'YUNITE PAMOJA CBO';

// --- Mocks ----------------------------------------------------------------
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({
    from: (table: string) => {
      const terminal = () => {
        if (table === 'users') return { data: adminRows, error: null };
        if (table === 'members') return { data: memberRow, error: null };
        return { data: null, error: null };
      };
      const builder: any = {
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => builder,
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        single: () => terminal(),
        then: (resolve?: (v: unknown) => unknown) => Promise.resolve(terminal()).then(resolve),
      };
      return builder;
    },
  }),
}));

jest.mock('@/lib/services/notifications/notification.service', () => ({
  notificationService: {
    sendFromTemplate: async (
      templateCode: string,
      recipient: { id: string; type: string; email?: string; name: string },
      variables: Record<string, unknown>
    ) => {
      sendFromTemplateCalls.push({ templateCode, recipient, variables });
      return { id: `n-${sendFromTemplateCalls.length}`, ref: `NTF-${sendFromTemplateCalls.length}` };
    },
  },
}));

jest.mock('@/lib/services/configuration.service', () => ({
  configurationService: {
    getSetting: async (key: string) => (key === 'organization.name' ? orgNameSetting : null),
  },
}));

import { notificationEventService } from '@/lib/services/notifications/event.service';

const memberData = {
  first_name: 'John',
  last_name: 'Doe',
  member_number: 'YUN-20260822-0001',
  phone: '0712345678',
  email: 'john.doe@example.com',
  registration_date: '2026-08-22',
};

describe('member.registered event acknowledgement', () => {
  beforeEach(() => {
    sendFromTemplateCalls.length = 0;
    orgNameSetting = 'YUNITE PAMOJA CBO';
  });

  it('notifies all admins AND sends a registration acknowledgement to the new member', async () => {
    await notificationEventService.emitMemberRegistered('m-new', memberData, 'u-admin');

    // Admin-facing notification to every admin (admin template).
    const adminCalls = sendFromTemplateCalls.filter((c) => c.templateCode === 'member.registered');
    expect(adminCalls).toHaveLength(2);
    expect(adminCalls.map((c) => c.recipient.id).sort()).toEqual(['u-admin', 'u-super']);
    expect(adminCalls.every((c) => c.recipient.type === 'user')).toBe(true);

    // Member-facing acknowledgement to the newly registered member.
    const memberCalls = sendFromTemplateCalls.filter(
      (c) => c.templateCode === 'member.registration_confirmation'
    );
    expect(memberCalls).toHaveLength(1);
    expect(memberCalls[0].recipient).toMatchObject({
      id: 'm-new',
      type: 'member',
      email: 'john.doe@example.com',
      name: 'John Doe',
    });
  });

  it('member acknowledgement carries member_number + organization_name variables', async () => {
    await notificationEventService.emitMemberRegistered('m-new', memberData, 'u-admin');

    const call = sendFromTemplateCalls.find(
      (c) => c.templateCode === 'member.registration_confirmation'
    )!;
    expect(call.variables.member_name).toBe('John Doe');
    expect(call.variables.member_number).toBe('YUN-20260822-0001');
    expect(call.variables.registration_date).toBe('2026-08-22');
    expect(call.variables.organization_name).toBe('YUNITE PAMOJA CBO');
  });

  it('falls back to the brand organization name when the setting is absent', async () => {
    orgNameSetting = null;
    await notificationEventService.emitMemberRegistered('m-new', memberData, 'u-admin');

    const call = sendFromTemplateCalls.find(
      (c) => c.templateCode === 'member.registration_confirmation'
    )!;
    expect(call.variables.organization_name).toBe('YUNITE PAMOJA CBO');
  });

  it('member acknowledgement uses the member id for idempotent routing, not the admin copy', async () => {
    await notificationEventService.emitMemberRegistered('m-new', memberData, 'u-admin');

    const memberCall = sendFromTemplateCalls.find(
      (c) => c.templateCode === 'member.registration_confirmation'
    )!;
    const adminCall = sendFromTemplateCalls.find((c) => c.templateCode === 'member.registered')!;
    // The member must never receive the admin-facing template and vice versa.
    expect(memberCall.recipient.type).toBe('member');
    expect(adminCall.recipient.type).toBe('user');
  });
});
