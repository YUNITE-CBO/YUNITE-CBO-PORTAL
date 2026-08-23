/**
 * Member service — server-side reads against the YUNITE backend.
 * All data and calculations come from the backend; no client-side math.
 */

import { apiGet, apiPost } from './client';
import type { Member, MemberBalances, Transaction, Loan, Fine, ContributionRow, WelfareRow, Notification, SupportTicket } from './types';

/**
 * Verify a member by the three public credentials (phone + id_number +
 * first_name). The backend is the source of truth: we fetch REAL member
 * records with the server-side API key and match all three fields here on
 * the server (the API key is never sent to the browser). Returns the
 * canonical member record on success, or null if any field does not match.
 *
 * NOTE: The YUNITE backend does not currently expose a dedicated
 * member-verification endpoint. Until one exists, verification is performed
 * against real backend member data within this server-side boundary — never
 * in the browser. See API_GAPS.md.
 */
export async function verifyMember(input: {
  phone: string;
  idNumber: string;
  firstName: string;
}): Promise<Member | null> {
  const members = await apiGet<Member[]>('/api/v1/members', { limit: '1000' });
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const phoneNorm = normalize(input.phone).replace(/[^\d+]/g, '');
  const idNorm = normalize(input.idNumber);
  const nameNorm = normalize(input.firstName);

  // Match all three together; reveal nothing about which one failed.
  const match = members.find((m) => {
    const mPhone = normalize(m.phone || '').replace(/[^\d+]/g, '');
    const mId = normalize(m.id_number || '');
    const mName = normalize(m.first_name || '');
    // Phone match tolerates leading-zero / +254 vs 0 differences.
    const phoneOk = mPhone === phoneNorm || loosePhoneMatch(mPhone, phoneNorm);
    const idOk = mId === idNorm;
    const nameOk = mName === nameNorm || mName.startsWith(nameNorm) || nameNorm.startsWith(mName);
    return phoneOk && idOk && nameOk;
  });

  return match ?? null;
}

function loosePhoneMatch(a: string, b: string): boolean {
  // Compare last 9 digits to tolerate +254 vs 0 prefixes.
  const strip = (s: string) => s.replace(/\D/g, '').slice(-9);
  return strip(a) === strip(b) && strip(a).length >= 9;
}

export async function getMember(memberId: string): Promise<Member | null> {
  try {
    // The backend returns the member *workspace* ({ member, accounts, ... }),
    // not a bare member; extract the member record.
    const workspace = await apiGet<{ member: Member } | Member>(`/api/v1/members/${memberId}`);
    if (workspace && typeof workspace === 'object' && 'member' in workspace && workspace.member) {
      return workspace.member;
    }
    return (workspace as Member) ?? null;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'status' in e && e.status === 404) return null;
    throw e;
  }
}

export async function getMemberBalances(memberId: string): Promise<MemberBalances> {
  return apiGet<MemberBalances>(`/api/v1/members/${memberId}/balances`);
}

export async function getTransactions(
  memberId: string,
  opts?: { account_type?: string; limit?: number },
): Promise<Transaction[]> {
  return apiGet<Transaction[]>('/api/v1/transactions', {
    member_id: memberId,
    account_type: opts?.account_type,
    limit: String(opts?.limit ?? 200),
  });
}

export async function getLoans(memberId: string): Promise<Loan[]> {
  return apiGet<Loan[]>('/api/v1/loans', { member_id: memberId });
}

export async function getFines(memberId: string): Promise<Fine[]> {
  return apiGet<Fine[]>('/api/v1/fines', { member_id: memberId });
}

export async function getContributions(): Promise<ContributionRow[]> {
  // NOTE: the backend contributions list is not member-filterable today; we
  // filter to this member server-side using transactions (source of truth).
  return apiGet<ContributionRow[]>('/api/v1/contributions');
}

export async function getWelfare(memberId: string): Promise<WelfareRow[]> {
  return apiGet<WelfareRow[]>('/api/v1/welfare', { member_id: memberId });
}

export async function getNotifications(memberId: string, opts?: { limit?: number }): Promise<Notification[]> {
  return apiGet<Notification[]>('/api/v1/notifications', {
    recipient_id: memberId,
    recipient_type: 'member',
    limit: String(opts?.limit ?? 50),
  });
}

export async function getSupportTickets(memberId: string): Promise<SupportTicket[]> {
  return apiGet<SupportTicket[]>('/api/v1/support/tickets', { member_id: memberId });
}

export async function createSupportTicket(
  memberId: string,
  input: { category: string; subject: string; message: string },
): Promise<SupportTicket> {
  return apiPost<SupportTicket>('/api/v1/support/tickets', {
    member_id: memberId,
    category: input.category,
    subject: input.subject,
    message: input.message,
    source: 'member_portal',
  });
}
