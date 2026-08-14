/** GET /api/member/loans — member loan portfolio. */
import { withMember } from '../_guard';
import { getLoans } from '@/lib/api/member.service';

export const GET = withMember((memberId) => getLoans(memberId));
