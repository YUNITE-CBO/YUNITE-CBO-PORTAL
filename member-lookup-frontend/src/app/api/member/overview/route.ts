/** GET /api/member/overview — member profile + authoritative balances (financial snapshot). */
import { withMember } from '../_guard';
import { getMember, getMemberBalances } from '@/lib/api/member.service';

export const GET = withMember(async (memberId) => {
  const [member, balances] = await Promise.all([
    getMember(memberId),
    getMemberBalances(memberId).catch(() => ({ member_id: memberId, balances: { savings: 0, shares: 0, contributions: 0, welfare: 0, fines: 0, loans: 0 } })),
  ]);
  return { member, balances };
});
