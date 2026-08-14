/** GET /api/member/notifications — member in-app notifications. */
import { withMember } from '../_guard';
import { getNotifications } from '@/lib/api/member.service';

export const GET = withMember((memberId) => getNotifications(memberId, { limit: 50 }));
