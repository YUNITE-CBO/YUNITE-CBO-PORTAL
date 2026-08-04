import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/services/notifications';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const sendEmailSchema = z.object({
  to: z.string().email(),
  toName: z.string().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  from: z.string().email().optional(),
  fromName: z.string().optional(),
  replyTo: z.string().email().optional(),
});

// GET /api/notifications/email
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Get queue stats
    if (action === 'stats') {
      const stats = await emailService.getQueueStats();
      return NextResponse.json({
        success: true,
        data: stats,
      });
    }

    // Test connection
    if (action === 'test') {
      const result = await emailService.testConnection();
      return NextResponse.json({
        success: result.success,
        message: result.message,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use ?action=stats or ?action=test' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error with email action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process email action' },
      { status: 500 }
    );
  }
}

// POST /api/notifications/email
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Send email directly
    if (!action || action === 'send') {
      const body = await request.json();
      const validated = sendEmailSchema.parse(body);

      const result = await emailService.send(validated);

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: 'Email sent successfully',
          data: { message_id: result.messageId },
        });
      } else {
        return NextResponse.json({
          success: false,
          error: result.error || 'Failed to send email',
        }, { status: 500 });
      }
    }

    // Process queue
    if (action === 'process') {
      const result = await emailService.processQueue();
      return NextResponse.json({
        success: true,
        message: 'Email queue processed',
        data: result,
      });
    }

    // Retry failed
    if (action === 'retry') {
      const body = await request.json().catch(() => ({}));
      const count = await emailService.retryFailed(body.email_ids);
      return NextResponse.json({
        success: true,
        message: `${count} emails queued for retry`,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error sending email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
