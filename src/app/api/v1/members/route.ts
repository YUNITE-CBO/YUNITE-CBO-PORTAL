import { createHandler, requireFields } from '@/lib/api/handler';
import { memberRegistrationService } from '@/lib/services/member-registration.service';

export const GET = createHandler('members.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const result = await memberRegistrationService.search({
    query: searchParams.get('query') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    page: Number(searchParams.get('page') ?? 1),
    limit: Number(searchParams.get('limit') ?? 20),
  });
  return { data: result.members, pagination: { page: result.page, limit: result.limit, total: result.total, total_pages: Math.ceil(result.total / result.limit) || 0 } };
});

export const POST = createHandler('members.create', async (ctx) => {
  const data = requireFields<Record<string, unknown>>(ctx.body, ['first_name', 'last_name', 'phone']);
  if (!ctx.principal.userId) throw new Error('User id required');
  const member = await memberRegistrationService.register(
    {
      first_name: String(data.first_name),
      last_name: String(data.last_name),
      email: data.email ? String(data.email) : undefined,
      phone: String(data.phone),
      id_number: data.id_number ? String(data.id_number) : undefined,
      date_of_birth: data.date_of_birth ? String(data.date_of_birth) : undefined,
      gender: data.gender ? (String(data.gender) as 'male' | 'female' | 'other') : undefined,
      physical_address: data.physical_address ? String(data.physical_address) : undefined,
      postal_address: data.postal_address ? String(data.postal_address) : undefined,
      occupation: data.occupation ? String(data.occupation) : undefined,
      employer: data.employer ? String(data.employer) : undefined,
      employer_address: data.employer_address ? String(data.employer_address) : undefined,
      next_of_kin_name: data.next_of_kin_name ? String(data.next_of_kin_name) : undefined,
      next_of_kin_phone: data.next_of_kin_phone ? String(data.next_of_kin_phone) : undefined,
      next_of_kin_relationship: data.next_of_kin_relationship ? String(data.next_of_kin_relationship) : undefined,
    },
    ctx.principal.userId
  );
  return { data: member, status: 201 };
});
