import { NextRequest, NextResponse } from 'next/server';
import { memberRegistrationSubmissionService } from '@/lib/services/member-registration-submission.service';
import { checkSimpleRateLimit, getRateLimitIp } from '@/lib/api/simple-rate-limit';
export const dynamic = 'force-dynamic';

/**
 * PUBLIC lookup: given an ID number and/or phone, confirm whether a matching
 * member record exists so the public pre-registration form can open in
 * "update my record" mode (instead of the applicant creating a duplicate).
 *
 * Exact, case-insensitive, single-record match only — no fuzzy search. The
 * response is deliberately MINIMIZED (name + member number only): knowing a
 * person's phone number must not unlock the rest of their file. Rate-limited
 * per IP to blunt phone/ID enumeration.
 */
export async function GET(request: NextRequest) {
  // Abuse guard: this is a PUBLIC endpoint that confirms whether a phone
  // number or national ID belongs to a member. Without a limit it is a
  // membership-enumeration oracle.
  const rl = checkSimpleRateLimit(`member-lookup:${getRateLimitIp(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many lookup attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }

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

    // MINIMIZED RESPONSE: the caller already proved knowledge of the lookup
    // identifier, so the response must not hand back any ADDITIONAL personal
    // data an attacker could be missing. Identity fields (KRA PIN, ID number,
    // date of birth, addresses, next of kin, emergency contacts) are NEVER
    // returned here — the applicant re-enters their own data in the form.
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
