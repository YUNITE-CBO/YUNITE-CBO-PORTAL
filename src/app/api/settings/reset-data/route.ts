import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/settings/reset-data
 * 
 * WARNING: This is a destructive operation!
 * 
 * Resets all financial data:
 * - Deletes all transactions
 * - Deletes all loans
 * - Deletes all fines
 * - Resets all campaign contributions to 0
 * - Deletes all accounts (member financial records)
 * 
 * Preserves:
 * - Members (financial records will be reset)
 * - Users
 * - Settings
 * - Audit logs (for history)
 * 
 * This operation CANNOT be undone!
 */
export async function POST(request: NextRequest) {
  let body: any;
  let supabase: Awaited<ReturnType<typeof createServiceClient>>;
  let userIdForAudit: string = 'system';

  try {
    body = await request.json();
    supabase = await createServiceClient();
    userIdForAudit = body.user_id || 'system';
    
    // Require explicit confirmation
    const { confirm_reset, user_id } = body;
    
    if (!confirm_reset) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Reset confirmation required. Set confirm_reset to true.' 
        },
        { status: 400 }
      );
    }

    // Log the reset attempt
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'system.data_reset_started',
      record_id: 'system',
      user_id: user_id || 'system',
      before_value: { timestamp: new Date().toISOString() },
      after_value: { status: 'initiated' },
      created_at: new Date().toISOString(),
    });

    // Order matters due to foreign keys!
    
    // 1. Delete all transactions (depends on accounts)
    const { error: txnError } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (txnError) {
      console.error('Error deleting transactions:', txnError);
      throw new Error(`Failed to delete transactions: ${txnError.message}`);
    }

    // 2. Delete all fines
    const { error: finesError } = await supabase.from('fines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (finesError) {
      console.error('Error deleting fines:', finesError);
      throw new Error(`Failed to delete fines: ${finesError.message}`);
    }

    // 3. Delete all loans
    const { error: loansError } = await supabase.from('loans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (loansError) {
      console.error('Error deleting loans:', loansError);
      throw new Error(`Failed to delete loans: ${loansError.message}`);
    }

    // 4. Delete all campaigns (contribution campaigns)
    const { error: campaignsError } = await supabase.from('campaigns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (campaignsError) {
      console.error('Error deleting campaigns:', campaignsError);
      throw new Error(`Failed to delete campaigns: ${campaignsError.message}`);
    }

    // 5. Delete all accounts (member financial accounts)
    const { error: accountsError } = await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (accountsError) {
      console.error('Error deleting accounts:', accountsError);
      throw new Error(`Failed to delete accounts: ${accountsError.message}`);
    }

    // 6. Delete all documents
    const { error: docsError } = await supabase.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (docsError) {
      console.error('Error deleting documents:', docsError);
      throw new Error(`Failed to delete documents: ${docsError.message}`);
    }

    // 7. Delete all compliance records
    const { error: complianceError } = await supabase.from('compliance_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (complianceError) {
      console.error('Error deleting compliance records:', complianceError);
      throw new Error(`Failed to delete compliance records: ${complianceError.message}`);
    }

    // 8. Reseed default campaigns
    await supabase.from('campaigns').insert([
      {
        id: uuidv4(),
        campaign_name: 'Monthly Contributions',
        description: 'Regular monthly contributions from all members',
        target_amount: 100000,
        collected_amount: 0,
        contribution_count: 0,
        start_date: new Date().toISOString().split('T')[0],
        is_active: true,
      },
      {
        id: uuidv4(),
        campaign_name: 'Special Contributions',
        description: 'Special contribution drives for specific purposes',
        target_amount: 50000,
        collected_amount: 0,
        contribution_count: 0,
        start_date: new Date().toISOString().split('T')[0],
        is_active: true,
      },
      {
        id: uuidv4(),
        campaign_name: 'Development Fund',
        description: 'Contributions towards organizational development',
        target_amount: 200000,
        collected_amount: 0,
        contribution_count: 0,
        start_date: new Date().toISOString().split('T')[0],
        is_active: true,
      },
    ]);

    // Log successful completion
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'system.data_reset_completed',
      record_id: 'system',
      user_id: user_id || 'system',
      after_value: { 
        status: 'completed', 
        timestamp: new Date().toISOString(),
        reset_tables: ['transactions', 'fines', 'loans', 'campaigns', 'accounts', 'documents', 'compliance_records']
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'All financial data has been reset successfully. Members are preserved.',
      data: {
        reset_at: new Date().toISOString(),
        preserved: ['members', 'users', 'settings', 'audit_logs'],
        reset: ['transactions', 'loans', 'fines', 'campaigns', 'accounts', 'documents', 'compliance_records'],
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Data reset failed';
    console.error('❌ Data reset failed:', error);

    // Log the failure
    try {
      const errorSupabase = await createServiceClient();
      await errorSupabase.from('audit_logs').insert({
        id: uuidv4(),
        action: 'system.data_reset_failed',
        record_id: 'system',
        user_id: userIdForAudit,
        after_value: { 
          status: 'failed', 
          error: errorMessage,
          timestamp: new Date().toISOString()
        },
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

/**
 * GET /api/settings/reset-data
 * 
 * Get data statistics before reset
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();
    
    // Get counts for all tables
    const [
      { count: transactions },
      { count: loans },
      { count: fines },
      { count: campaigns },
      { count: accounts },
      { count: members },
      { count: documents },
      { count: compliance_records },
    ] = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true }),
      supabase.from('loans').select('*', { count: 'exact', head: true }),
      supabase.from('fines').select('*', { count: 'exact', head: true }),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('accounts').select('*', { count: 'exact', head: true }),
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('compliance_records').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        will_be_deleted: {
          transactions: transactions || 0,
          loans: loans || 0,
          fines: fines || 0,
          campaigns: campaigns || 0,
          accounts: accounts || 0,
          documents: documents || 0,
          compliance_records: compliance_records || 0,
        },
        will_be_preserved: {
          members: members || 0,
        },
      },
    });
  } catch (error) {
    console.error('Error getting data stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get data statistics' },
      { status: 500 }
    );
  }
}
