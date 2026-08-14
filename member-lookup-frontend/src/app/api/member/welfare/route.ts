/** GET /api/member/welfare — welfare balance + history. */
import { withMember } from '../_guard';
import { getMemberBalances, getTransactions } from '@/lib/api/member.service';

export const GET = withMember(async (memberId) => {
  const [balances, transactions] = await Promise.all([
    getMemberBalances(memberId),
    getTransactions(memberId, { account_type: 'welfare' }),
  ]);
  return {
    balance: balances.balances.welfare,
    transactions,
  };
});
