import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationSubmissionService } from '@/lib/services/member-registration-submission.service';
export const dynamic = 'force-dynamic';

/**
 * PUBLIC lookup: given an ID number and/or phone, return the matching member
 * record so the public pre-registration form can open in "pre-edit" mode with
 * the applicant's on-file data (instead of them creating a duplicate profile
 * by accident).
 *
 * Exact, case-insensitive, single-record match only — no fuzzy search. There
 * is deliberately no list/search surface here.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const id_number = sp.get('id_number') || undefined;
    const phone = sp.get('phone') || undefined;

    if (!id_number && !phone) {
      return NextResponse.json(
        { success: false, error: 'Provide an ID number or phone number to look up.' },
        { status: 400 }
      );
    }

    const member = await memberRegistrationSubmissionService.lookupExistingMember({ id_number, phone });

    if (!member) {
      return NextResponse.json({ success: true, data: { exists: false } });
    }

    const m = member as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        member: {
          id: m.id,
          member_number: m.member_number,
          status: m.status,
          first_name: m.first_name,
          last_name: m.last_name,
          email: m.email ?? null,
          phone: m.phone ?? null,
          alt_phone: m.alt_phone ?? null,
          alt_email: m.alt_email ?? null,
          id_number: m.id_number ?? null,
          kra_pin: m.kra_pin ?? null,
          date_of_birth: m.date_of_birth ?? null,
          gender: m.gender ?? null,
          marital_status: m.marital_status ?? null,
          nationality: m.nationality ?? null,
          physical_address: m.physical_address ?? null,
          postal_address: m.postal_address ?? null,
          occupation: m.occupation ?? null,
          employer: m.employer ?? null,
          employer_address: m.employer_address ?? null,
          next_of_kin_name: m.next_of_kin_name ?? null,
          next_of_kin_phone: m.next_of_kin_phone ?? null,
          next_of_kin_relationship: m.next_of_kin_relationship ?? null,
          emergency_contact_name: m.emergency_contact_name ?? null,
          emergency_contact_phone: m.emergency_contact_phone ?? null,
          emergency_contact_relationship: m.emergency_contact_relationship ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Member lookup error:', error);
    return NextResponse.json(
      { success: false, error: 'Lookup failed. Please try again later.' },
      { status: 500 }
    );
  }
}
