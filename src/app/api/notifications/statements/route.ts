import { NextRequest, NextResponse } from 'next/server';
import { statementService } from '@/lib/services/notifications';
import { z } from 'zod';
export const dynamic = 'force-dynamic';

const generateStatementSchema = z.object({
  statement_type: z.enum([
    'member_weekly', 'member_monthly', 'member_quarterly', 'member_annual',
    'loan_statement', 'savings_statement', 'contribution_statement',
    'welfare_statement', 'organization_summary', 'custom'
  ]),
  period_start: z.string(),
  period_end: z.string(),
  recipient_type: z.enum(['member', 'admin', 'organization']),
  recipient_id: z.string().uuid().optional(),
  recipient_email: z.string().email().optional(),
  recipient_name: z.string().optional(),
  schedule_id: z.string().uuid().optional(),
  schedule_run_id: z.string().optional(),
  created_by: z.string().uuid().optional(),
});

// GET /api/notifications/statements
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const statementId = searchParams.get('id');
    const recipientId = searchParams.get('recipient_id');
    const statementType = searchParams.get('statement_type');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get single statement
    if (statementId) {
      const statement = await statementService.getById(statementId);
      if (!statement) {
        return NextResponse.json(
          { success: false, error: 'Statement not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: statement });
    }

    // Get statements for recipient
    if (recipientId) {
      const result = await statementService.getForRecipient(recipientId, {
        statement_type: statementType as any,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: result.statements,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'recipient_id or id is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching statements:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statements' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/statements
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = generateStatementSchema.parse(body);

    const deliver = body.deliver === true;

    let result;
    if (deliver && validated.recipient_email) {
      result = await statementService.generateAndDeliver({
        ...validated,
        period_start: new Date(validated.period_start),
        period_end: new Date(validated.period_end),
      });
    } else {
      const statement = await statementService.generate({
        ...validated,
        period_start: new Date(validated.period_start),
        period_end: new Date(validated.period_end),
      });
      result = { statement_id: statement.id, email_sent: false };
    }

    return NextResponse.json({
      success: true,
      message: deliver && result.email_sent 
        ? 'Statement generated and delivered successfully' 
        : 'Statement generated successfully',
      data: result,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error generating statement:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate statement' },
      { status: 500 }
    );
  }
}
