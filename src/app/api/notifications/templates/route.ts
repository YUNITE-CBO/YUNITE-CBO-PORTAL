import { NextRequest, NextResponse } from 'next/server';
import { templateService } from '@/lib/services/notifications';
import { z } from 'zod';

const createTemplateSchema = z.object({
  template_code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  channels: z.array(z.enum(['in_app', 'email', 'sms'])).optional(),
  subject_template: z.string().min(1),
  subject_variables: z.array(z.string()).optional(),
  body_template: z.string().min(1),
  body_variables: z.array(z.string()).optional(),
  html_body_template: z.string().optional(),
  html_body_variables: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  is_active: z.boolean().optional(),
  created_by: z.string().uuid().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

// GET /api/notifications/templates
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active');
    const templateId = searchParams.get('id');
    const templateCode = searchParams.get('code');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get single template
    if (templateId) {
      const template = await templateService.getById(templateId);
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: template });
    }

    // Get template by code
    if (templateCode) {
      const template = await templateService.getByCode(templateCode);
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: template });
    }

    // Get all templates
    const result = await templateService.getAll({
      category_id: categoryId || undefined,
      is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.templates,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/templates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);

    const template = await templateService.create(validated);

    return NextResponse.json({
      success: true,
      message: 'Template created successfully',
      data: template,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}

// PUT /api/notifications/templates
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = updateTemplateSchema.parse(body);

    const template = await templateService.update(templateId, validated, body.created_by);

    return NextResponse.json({
      success: true,
      message: 'Template updated successfully',
      data: template,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/templates
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      );
    }

    await templateService.delete(templateId);

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
