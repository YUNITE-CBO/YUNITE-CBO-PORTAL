import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/error';
import { documentService } from '@/lib/services/document.service';

export const GET = createHandler('documents.list', async (ctx) => {
  const { searchParams } = new URL(ctx.request.url);
  const memberId = searchParams.get('member_id');
  if (!memberId) throw ApiError.validation('member_id query parameter is required');
  const data = await documentService.getMemberDocuments(memberId);
  return { data };
});

export const POST = createHandler('documents.create', async (ctx) => {
  if (!ctx.principal.userId) throw ApiError.unauthorized('User id required');
  const formData = await ctx.request.formData();
  const file = formData.get('file');
  const fileName = (formData.get('file_name') as string) || (file instanceof File ? file.name : 'upload');
  const memberId = formData.get('member_id') as string;
  const module = (formData.get('module') as string) || 'members';
  const documentCategoryId = formData.get('document_category_id') as string | null;

  if (!memberId) throw ApiError.validation('member_id is required');
  if (!(file instanceof File)) throw ApiError.validation('file is required');

  // Upload delegated to the authoritative Document Service.
  const result = await documentService.uploadFile(file, fileName, {
    module,
    entityType: 'member',
    entityId: memberId,
    documentCategoryId: documentCategoryId ?? undefined,
    userId: ctx.principal.userId,
    userName: ctx.principal.userEmail,
  });
  if (!result.success) throw ApiError.server(result.error ?? 'Upload failed');
  return { data: result, status: 201 };
});
