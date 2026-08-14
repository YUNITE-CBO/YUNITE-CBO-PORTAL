/** GET /api/member/savings — savings balance + savings transaction history (running balance from backend snapshots). */
import { withMember } from '../_guard';
import { getMemberBalances, getTransactions } from '@/lib/api/member.service';

export const GET = withMember(async (memberId) => {
  const [balances, transactions] = await Promise.all([
    getMemberBalances(memberId),
    getTransactions(memberId, { account_type: 'savings' }),
  ]);
  return {
    balance: balances.balances.savings,
    transactions,
  };
});
