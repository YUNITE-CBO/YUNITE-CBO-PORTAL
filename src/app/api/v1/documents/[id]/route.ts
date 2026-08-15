import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { documentService } from '@/lib/services/document.service';
import { createServiceClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

export const GET = createHandler('documents.get', async (ctx) => {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from('documents').select('*').eq('id', ctx.params.id).maybeSingle();
  if (error) throw ApiError.server(error.message);
  if (!data) throw ApiError.notFound('Document not found');
  return { data };
});

export const DELETE = createHandler('documents.delete', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const { searchParams } = new URL(ctx.request.url);
  const reason = searchParams.get('reason') ?? undefined;
  // Deletion delegated to the authoritative Document Service (which removes
  // storage + record and is the only sanctioned delete path).
  const result = await documentService.deleteDocument(ctx.params.id, ctx.principal.userId, reason);
  if (!result.success) throw ApiError.server(result.error ?? 'Delete failed');
  return { data: { id: ctx.params.id, deleted: true } };
});
