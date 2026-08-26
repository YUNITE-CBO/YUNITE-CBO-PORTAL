/**
 * DATABASE RESET & INITIALIZATION API
 * 
 * YUNITE Enterprise Operating System
 * 
 * Provides comprehensive database reset capabilities with multiple
 * safety layers and audit trail.
 * 
 * Endpoints:
 * - GET /api/settings/database-reset - Get reset options and current stats
 * - POST /api/settings/database-reset - Execute database reset
 * - POST /api/settings/database-reset/verify-password - Verify admin password
 * - GET /api/settings/database-reset/reports - Get reset history reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { databaseResetService, ResetLevel } from '@/lib/services/database-admin/database-reset.service';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, requireSuperAdmin } from '@/lib/auth/authorization';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/database-reset
 *
 * Get reset options, current database statistics, and system state.
 * Admin+ only — the response exposes dataset sizes and reset capabilities.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.success || !auth.user) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Access denied' },
      { status: auth.status || 403 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level') as ResetLevel | null;
    
    const [stats, systemState] = await Promise.all([
      databaseResetService.getDatabaseStats(),
      databaseResetService.getSystemState(),
    ]);

    // Build reset levels with correct IDs
    const resetLevels = [
      {
        id: 'level_1_financial',
        ...databaseResetService.getResetLevelConfig('level_1_financial'),
      },
      {
        id: 'level_2_operational',
        ...databaseResetService.getResetLevelConfig('level_2_operational'),
      },
      {
        id: 'level_3_organization',
        ...databaseResetService.getResetLevelConfig('level_3_organization'),
      },
    ];

    const response: any = {
      success: true,
      data: {
        database_stats: stats,
        system_state: systemState,
        reset_levels: resetLevels.map(l => ({
          id: l.id,
          name: l.name,
          description: l.description,
          affected_tables: l.tables_to_delete,
          preserved_tables: l.preserve_tables,
        })),
      },
    };

    // If specific level requested, add impact summary
    if (level) {
      const config = databaseResetService.getResetLevelConfig(level);
      response.data.selected_level = {
        id: level,
        name: config.name,
        description: config.description,
      };
      response.data.impact_summary = {
        will_be_deleted: config.tables_to_delete.map(t => ({
          table: t,
          count: (stats as any)[t] || 0,
        })),
        will_be_preserved: config.preserve_tables,
        total_records_affected: config.tables_to_delete.reduce(
          (sum, t) => sum + ((stats as any)[t] || 0), 
          0
        ),
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching database reset info:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch database reset information' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/database-reset
 *
 * Execute database reset with comprehensive safety checks.
 *
 * Security: the caller's identity and role come from the verified session
 * JWT (requireSuperAdmin) — NEVER from the request body. Level 3
 * (organization wipe) additionally requires the caller's real account
 * password, verified server-side against users.password_hash.
 */
export async function POST(request: NextRequest) {
  let body: any;
  let supabase: Awaited<ReturnType<typeof createServiceClient>>;
  let userIdForAudit: string = 'unknown';

  // Verified-session authorization: super_admin only.
  const auth = await requireSuperAdmin(request);
  if (!auth.success || !auth.user) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Only Super Administrators can perform database reset' },
      { status: auth.status || 403 }
    );
  }
  const user_id = auth.user.user_id;

  try {
    body = await request.json();
    supabase = await createServiceClient();
    userIdForAudit = user_id;

    // =========================================================================
    // SAFETY VALIDATION
    // =========================================================================

    const {
      level,
      confirmation_phrase,
      backup_verified,
      archive_instead_of_delete = true,
      delete_audit_logs = false,
    } = body;

    // Validate reset level
    if (!level || !['level_1_financial', 'level_2_operational', 'level_3_organization'].includes(level)) {
      return NextResponse.json(
        { success: false, error: 'Invalid reset level specified' },
        { status: 400 }
      );
    }

    // Verify confirmation phrase
    if (confirmation_phrase !== 'RESET YUNITE DATABASE') {
      return NextResponse.json(
        { success: false, error: 'Incorrect confirmation phrase. Type "RESET YUNITE DATABASE" exactly.' },
        { status: 400 }
      );
    }

    // Verify backup was checked
    if (!backup_verified) {
      return NextResponse.json(
        { success: false, error: 'You must verify that a backup has been created before proceeding' },
        { status: 400 }
      );
    }

    // =========================================================================
    // LEVEL-SPECIFIC SAFETY REQUIREMENTS
    // =========================================================================

    let passwordVerified = false;

    if (level === 'level_3_organization') {
      // Level 3 requires the caller's REAL account password, verified
      // server-side — a client-supplied boolean is not proof of anything.
      const providedPassword = typeof body.password === 'string' ? body.password : '';
      if (!providedPassword) {
        return NextResponse.json(
          {
            success: false,
            error: 'Password verification required for Organization Reset',
            requires_password: true,
          },
          { status: 403 }
        );
      }

      const { data: credUser } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', user_id)
        .single();

      if (!credUser?.password_hash || !(await bcrypt.compare(providedPassword, credUser.password_hash))) {
        return NextResponse.json(
          { success: false, error: 'Incorrect password for Organization Reset' },
          { status: 403 }
        );
      }
      passwordVerified = true;
    }

    const user = { id: user_id, email: auth.user.email };

    // =========================================================================
    // LOG THE ATTEMPT
    // =========================================================================

    console.log('🔴 DATABASE RESET INITIATED');
    console.log(`   Level: ${level}`);
    console.log(`   User: ${user.email}`);
    console.log(`   Archive: ${archive_instead_of_delete}`);
    console.log(`   Delete Audit Logs: ${delete_audit_logs}`);

    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'system.reset_attempted',
      record_id: 'database',
      user_id: user_id,
      before_value: { level, archive_instead_of_delete },
      after_value: { status: 'initiated' },
      created_at: new Date().toISOString(),
    });

    // =========================================================================
    // EXECUTE RESET
    // =========================================================================

    const report = await databaseResetService.executeReset({
      level,
      archive_instead_of_delete,
      delete_audit_logs,
      backup_verified,
      user_id,
      password_verified: passwordVerified,
      two_factor_verified: body.two_factor_verified,
      confirmation_phrase,
    });

    console.log('✅ DATABASE RESET COMPLETED');
    console.log(`   Report ID: ${report.id}`);
    console.log(`   Validation: ${report.validation_passed ? 'PASSED' : 'FAILED'}`);

    return NextResponse.json({
      success: true,
      message: `Database ${level.replace('_', ' ')} completed successfully`,
      data: {
        report_id: report.id,
        status: report.status,
        reset_level: report.reset_level,
        stats: report.stats,
        system_state: report.system_state,
        validation_passed: report.validation_passed,
        validation_errors: report.validation_errors,
        archived: report.archived,
        archive_id: report.archive_id,
        completed_at: report.completed_at,
        phases_completed: report.phases_completed,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Database reset failed';
    console.error('❌ Database reset failed:', error);

    // Log the failure
    try {
      const errorSupabase = await createServiceClient();
      await errorSupabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'system.reset_failed',
        record_id: 'database',
        user_id: userIdForAudit,
        after_value: { error: errorMessage },
        created_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('Failed to log audit event:', logError);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
