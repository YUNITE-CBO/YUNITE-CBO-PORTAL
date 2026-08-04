import { NextRequest, NextResponse } from 'next/server';
import { templateService } from '@/lib/services/notifications';
import { z } from 'zod';

const previewSchema = z.object({
  template_id: z.string().uuid().optional(),
  template_code: z.string().optional(),
  variables: z.record(z.unknown()),
});

// POST /api/notifications/templates/preview
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = previewSchema.parse(body);

    if (!validated.template_id && !validated.template_code) {
      return NextResponse.json(
        { success: false, error: 'Either template_id or template_code is required' },
        { status: 400 }
      );
    }

    let templateId = validated.template_id;
    
    if (!templateId && validated.template_code) {
      const template = await templateService.getByCode(validated.template_code);
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }
      templateId = template.id;
    }

    const preview = await templateService.preview(templateId!, validated.variables);

    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error previewing template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to preview template' },
      { status: 500 }
    );
  }
}
