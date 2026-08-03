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
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/settings/database-reset
 * 
 * Get reset options, current database statistics, and system state
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level') as ResetLevel | null;
    
    const [stats, systemState, resetLevels] = await Promise.all([
      databaseResetService.getDatabaseStats(),
      databaseResetService.getSystemState(),
      Promise.resolve([
        databaseResetService.getResetLevelConfig('level_1_financial'),
        databaseResetService.getResetLevelConfig('level_2_operational'),
        databaseResetService.getResetLevelConfig('level_3_organization'),
      ]),
    ]);

    const response: any = {
      success: true,
      data: {
        database_stats: stats,
        system_state: systemState,
        reset_levels: resetLevels.map(l => ({
          id: Object.keys(databaseResetService.getResetLevelConfig('level_1_financial')).find(k => 
            databaseResetService.getResetLevelConfig(k as ResetLevel) === l
          ) || 'level_1_financial',
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
 * Execute database reset with comprehensive safety checks
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createServiceClient();

    // =========================================================================
    // SAFETY VALIDATION
    // =========================================================================

    const {
      level,
      user_id,
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

    // Require user_id
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Verify user is super_admin
    const { data: user } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', user_id)
      .eq('role', 'super_admin')
      .single();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Only Super Administrators can perform database reset' },
        { status: 403 }
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

    if (level === 'level_3_organization') {
      // Level 3 requires additional confirmation
      if (!body.password_verified) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Password verification required for Organization Reset',
            requires_password: true,
          },
          { status: 403 }
        );
      }
    }

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
      password_verified: body.password_verified || false,
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

    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'system.reset_failed',
      record_id: 'database',
      user_id: body?.user_id || 'unknown',
      after_value: { error: errorMessage },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
