/** GET /api/member/contributions — contributions balance + history (sourced from backend transactions, the source of truth). */
import { withMember } from '../_guard';
import { getMemberBalances, getTransactions } from '@/lib/api/member.service';

export const GET = withMember(async (memberId) => {
  const [balances, transactions] = await Promise.all([
    getMemberBalances(memberId),
    getTransactions(memberId, { account_type: 'contributions' }),
  ]);
  return {
    balance: balances.balances.contributions,
    transactions,
  };
});
