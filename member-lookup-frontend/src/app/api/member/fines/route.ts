/** GET /api/member/fines — member fines (pending + partial). */
import { withMember } from '../_guard';
import { getFines } from '@/lib/api/member.service';

export const GET = withMember((memberId) => getFines(memberId));
