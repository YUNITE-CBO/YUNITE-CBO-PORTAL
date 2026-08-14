/** GET /api/org-info — public organization contact info (no member session required). */
import { NextResponse } from 'next/server';
import { getOrganizationSettings } from '@/lib/api/meeting.service';

export async function GET() {
  const s = await getOrganizationSettings();
  return NextResponse.json({
    success: true,
    data: {
      name: s['organization.name'] || 'YUNITE Pamoja CBO',
      phone: s['organization.phone'] || undefined,
      email: s['organization.email'] || undefined,
      address: s['organization.address'] || undefined,
    },
  });
}
