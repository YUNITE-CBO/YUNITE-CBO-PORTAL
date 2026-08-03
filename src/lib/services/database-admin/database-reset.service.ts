/**
 * DATABASE RESET & INITIALIZATION SERVICE
 * 
 * YUNITE Enterprise Operating System
 * 
 * This service provides comprehensive database reset capabilities for organizations
 * that need to begin a completely new operational cycle without rebuilding
 * the system from scratch.
 * 
 * Reset Levels:
 * - Level 1 (Financial Reset): Only financial transactions
 * - Level 2 (Operational Reset): Financial + operational records
 * - Level 3 (Organization Reset): Complete reset except core structure
 * 
 * Safety Features:
 * - Archive before delete option
 * - Comprehensive validation
 * - Integrity verification
 * - Detailed audit reporting
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ResetLevel = 'level_1_financial' | 'level_2_operational' | 'level_3_organization';

export type ResetStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'archived';

export interface ResetStats {
  // Core counts
  transactions: number;
  loans: number;
  fines: number;
  campaigns: number;
  accounts: number;
  documents: number;
  compliance_records: number;
  
  // Level 2 additions
  meetings: number;
  notifications: number;
  reports: number;
  
  // Level 3 additions
  members: number;
  users: number;
  roles: number;
  
  // Archives
  archived_transactions?: number;
  archived_loans?: number;
  archived_fines?: number;
  archived_campaigns?: number;
  archived_accounts?: number;
  archived_documents?: number;
  archived_compliance_records?: number;
  archived_meetings?: number;
  archived_notifications?: number;
  archived_reports?: number;
}

export interface ResetProgress {
  phase: string;
  subphase?: string;
  progress: number;
  totalPhases: number;
  currentPhase: number;
  details?: string;
}

export interface ResetReport {
  id: string;
  reset_level: ResetLevel;
  status: ResetStatus;
  initiated_by: string;
  initiated_at: string;
  completed_at?: string;
  stats: ResetStats;
  backup_created: boolean;
  phases_completed: string[];
  validation_passed: boolean;
  validation_errors?: string[];
  system_state: {
    savings_balance: number;
    contributions_balance: number;
    loans_balance: number;
    fines_balance: number;
    welfare_balance: number;
    accounts_count: number;
  };
  archived?: boolean;
  archive_id?: string;
}

export interface ResetConfig {
  level: ResetLevel;
  archive_instead_of_delete: boolean;
  delete_audit_logs: boolean;
  backup_verified: boolean;
  user_id: string;
  password_verified: boolean;
  two_factor_verified?: boolean;
  confirmation_phrase: string;
}

// ============================================================================
// RESET LEVEL CONFIGURATIONS
// ============================================================================

const RESET_LEVEL_CONFIG = {
  level_1_financial: {
    name: 'Financial Reset',
    description: 'Resets all financial transactions and balances. Members and core structure remain.',
    tables_to_delete: [
      'transactions',
      'loans',
      'fines',
      'campaigns',
      'accounts',
    ],
    preserve_tables: [
      'members',
      'users',
      'settings',
      'roles',
      'permissions',
      'audit_logs',
      'documents',
      'compliance_records',
      'meetings',
      'notifications',
      'reports',
    ],
  },
  level_2_operational: {
    name: 'Operational Reset',
    description: 'Resets all financial and operational records. Members and users remain.',
    tables_to_delete: [
      'transactions',
      'loans',
      'fines',
      'campaigns',
      'accounts',
      'documents',
      'compliance_records',
      'meetings',
      'notifications',
      'reports',
    ],
    preserve_tables: [
      'members',
      'users',
      'settings',
      'roles',
      'permissions',
      'audit_logs',
    ],
  },
  level_3_organization: {
    name: 'Organization Reset',
    description: 'Complete system reset. Only Super Admin, Settings, and Security Configuration remain.',
    tables_to_delete: [
      'transactions',
      'loans',
      'fines',
      'campaigns',
      'accounts',
      'documents',
      'compliance_records',
      'meetings',
      'notifications',
      'reports',
      'members',
      'users',
    ],
    preserve_tables: [
      'settings',
      'roles',
      'permissions',
      'audit_logs',
    ],
  },
};

// ============================================================================
// DATABASE RESET SERVICE
// ============================================================================

export class DatabaseResetService {
  private supabase = createServiceClient();
  private resetReport: ResetReport | null = null;
  private progressCallbacks: ((progress: ResetProgress) => void)[] = [];

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (progress: ResetProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Emit progress update
   */
  private emitProgress(progress: ResetProgress): void {
    this.progressCallbacks.forEach(cb => cb(progress));
  }

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(): Promise<ResetStats> {
    const supabase = await createServiceClient();
    
    // Core tables that always exist
    const coreStats = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true }),
      supabase.from('loans').select('*', { count: 'exact', head: true }),
      supabase.from('fines').select('*', { count: 'exact', head: true }),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('accounts').select('*', { count: 'exact', head: true }),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('compliance_records').select('*', { count: 'exact', head: true }),
      supabase.from('members').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
    ]);

    // Optional tables that may not exist
    let meetingsCount = 0;
    let notificationsCount = 0;
    let reportsCount = 0;
    let rolesCount = 0;

    try {
      const meetings = await supabase.from('meetings').select('*', { count: 'exact', head: true });
      meetingsCount = meetings.count || 0;
    } catch (e) {
      console.log('meetings table not found');
    }

    try {
      const notifications = await supabase.from('notifications').select('*', { count: 'exact', head: true });
      notificationsCount = notifications.count || 0;
    } catch (e) {
      console.log('notifications table not found');
    }

    try {
      const reports = await supabase.from('reports').select('*', { count: 'exact', head: true });
      reportsCount = reports.count || 0;
    } catch (e) {
      console.log('reports table not found');
    }

    try {
      const roles = await supabase.from('roles').select('*', { count: 'exact', head: true });
      rolesCount = roles.count || 0;
    } catch (e) {
      console.log('roles table not found');
    }

    return {
      transactions: coreStats[0].count || 0,
      loans: coreStats[1].count || 0,
      fines: coreStats[2].count || 0,
      campaigns: coreStats[3].count || 0,
      accounts: coreStats[4].count || 0,
      documents: coreStats[5].count || 0,
      compliance_records: coreStats[6].count || 0,
      meetings: meetingsCount,
      notifications: notificationsCount,
      reports: reportsCount,
      members: coreStats[7].count || 0,
      users: coreStats[8].count || 0,
      roles: rolesCount,
    };
  }

  /**
   * Get current system state (balances)
   */
  async getSystemState(): Promise<ResetReport['system_state']> {
    const supabase = await createServiceClient();
    
    // Calculate total balances from transactions
    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_type, amount')
      .eq('reversed', false);

    let savings = 0;
    let contributions = 0;
    let loans = 0;
    let fines = 0;
    let welfare = 0;

    if (txns) {
      for (const txn of txns) {
        const amount = Number(txn.amount);
        const type = txn.transaction_type;
        
        if (['savings_deposit', 'savings_withdrawal'].includes(type)) {
          savings += type === 'savings_deposit' ? amount : -amount;
        } else if (['contribution_monthly', 'contribution_special', 'contribution_development'].includes(type)) {
          contributions += amount;
        } else if (['loan_disbursement', 'loan_repayment'].includes(type)) {
          loans += type === 'loan_disbursement' ? amount : -amount;
        } else if (['fine_posting', 'fine_payment'].includes(type)) {
          fines += type === 'fine_posting' ? amount : -amount;
        } else if (['welfare_deposit', 'welfare_disbursement'].includes(type)) {
          welfare += type === 'welfare_deposit' ? amount : -amount;
        }
      }
    }

    const { count: accountsCount } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });

    return {
      savings_balance: Math.max(0, savings),
      contributions_balance: Math.max(0, contributions),
      loans_balance: Math.max(0, loans),
      fines_balance: Math.max(0, fines),
      welfare_balance: Math.max(0, welfare),
      accounts_count: accountsCount || 0,
    };
  }

  /**
   * Create archive of all records before reset
   */
  async createArchive(level: ResetLevel): Promise<string> {
    const supabase = await createServiceClient();
    const archiveId = `ARCHIVE-${Date.now()}-${uuidv4().split('-')[0]}`;
    
    console.log(`📦 Creating archive: ${archiveId}`);
    
    const config = RESET_LEVEL_CONFIG[level];
    const archivedStats: Partial<ResetStats> = {};
    
    // Try to create archives table if it doesn't exist
    let archivesAvailable = true;
    try {
      await supabase.from('archives').select('id').limit(1);
    } catch (e) {
      console.log('Archives table not available, skipping archive creation');
      archivesAvailable = false;
    }
    
    // Archive each table
    for (const table of config.tables_to_delete) {
      try {
        const { data, error } = await supabase
          .from(table as any)
          .select('*');
        
        if (data && data.length > 0 && archivesAvailable) {
          // Insert into archive table
          await supabase.from('archives').insert({
            id: uuidv4(),
            archive_id: archiveId,
            table_name: table,
            records: data,
            reset_level: level,
            record_count: data.length,
            created_at: new Date().toISOString(),
          });
          
          (archivedStats as any)[`archived_${table}`] = data.length;
          console.log(`✓ Archived ${data.length} records from ${table}`);
        } else if (data && data.length > 0) {
          console.log(`⚠ Table ${table} has ${data.length} records but archives table not available`);
        }
      } catch (e) {
        console.log(`⚠ Table ${table} not found, skipping archive`);
      }
    }
    
    console.log(`✅ Archive created: ${archiveId}`);
    return archiveId;
  }

  /**
   * Execute database reset
   */
  async executeReset(config: ResetConfig): Promise<ResetReport> {
    const supabase = await createServiceClient();
    const reportId = uuidv4();
    const totalPhases = this.getPhasesCount(config.level);
    let currentPhase = 0;

    // Initialize report
    this.resetReport = {
      id: reportId,
      reset_level: config.level,
      status: 'in_progress',
      initiated_by: config.user_id,
      initiated_at: new Date().toISOString(),
      stats: await this.getDatabaseStats(),
      backup_created: config.backup_verified,
      phases_completed: [],
      validation_passed: false,
      system_state: await this.getSystemState(),
    };

    // Log initiation
    await this.logAuditEvent('reset_initiated', {
      level: config.level,
      archive_instead_of_delete: config.archive_instead_of_delete,
    });

    try {
      // Phase 1: Create archive if requested
      currentPhase++;
      this.emitProgress({
        phase: 'Creating Archive',
        progress: (currentPhase / totalPhases) * 100,
        totalPhases,
        currentPhase,
        details: config.archive_instead_of_delete 
          ? 'Archiving records before deletion...' 
          : 'Skipping archive (delete mode)',
      });

      if (config.archive_instead_of_delete) {
        const archiveId = await this.createArchive(config.level);
        this.resetReport.archive_id = archiveId;
        this.resetReport.archived = true;
      }
      this.resetReport.phases_completed.push('archive');

      // Phase 2: Delete financial records (Level 1+)
      currentPhase++;
      this.emitProgress({
        phase: 'Resetting Financial Records',
        progress: (currentPhase / totalPhases) * 100,
        totalPhases,
        currentPhase,
        details: 'Deleting transactions, loans, fines, accounts...',
      });

      await this.deleteFinancialRecords();
      this.resetReport.phases_completed.push('financial_records');

      // Phase 3: Delete operational records (Level 2+)
      if (config.level !== 'level_1_financial') {
        currentPhase++;
        this.emitProgress({
          phase: 'Resetting Operational Records',
          progress: (currentPhase / totalPhases) * 100,
          totalPhases,
          currentPhase,
          details: 'Deleting documents, compliance, meetings...',
        });

        await this.deleteOperationalRecords();
        this.resetReport.phases_completed.push('operational_records');
      }

      // Phase 4: Delete users and members (Level 3 only)
      if (config.level === 'level_3_organization') {
        currentPhase++;
        this.emitProgress({
          phase: 'Resetting Organization Records',
          progress: (currentPhase / totalPhases) * 100,
          totalPhases,
          currentPhase,
          details: 'Archiving members and users...',
        });

        await this.deleteOrganizationRecords();
        this.resetReport.phases_completed.push('organization_records');
      }

      // Phase 5: Clear audit logs if requested
      if (config.delete_audit_logs) {
        currentPhase++;
        this.emitProgress({
          phase: 'Clearing Audit Logs',
          progress: (currentPhase / totalPhases) * 100,
          totalPhases,
          currentPhase,
          details: 'Deleting audit log history...',
        });

        await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        this.resetReport.phases_completed.push('audit_logs');
      }

      // Phase 6: Reseed default data
      currentPhase++;
      this.emitProgress({
        phase: 'Reseeding Default Data',
        progress: (currentPhase / totalPhases) * 100,
        totalPhases,
        currentPhase,
        details: 'Creating default campaigns, resetting counters...',
      });

      await this.reseedDefaultData(config.level);
      this.resetReport.phases_completed.push('reseed_defaults');

      // Phase 7: Integrity verification
      currentPhase++;
      this.emitProgress({
        phase: 'Running Integrity Verification',
        progress: (currentPhase / totalPhases) * 100,
        totalPhases,
        currentPhase,
        details: 'Validating system consistency...',
      });

      const validationResult = await this.runIntegrityVerification();
      this.resetReport.validation_passed = validationResult.passed;
      this.resetReport.validation_errors = validationResult.errors;
      this.resetReport.phases_completed.push('integrity_verification');

      // Update final state
      this.resetReport.status = 'completed';
      this.resetReport.completed_at = new Date().toISOString();
      this.resetReport.system_state = await this.getSystemState();

      // Log completion
      await this.logAuditEvent('reset_completed', {
        report: this.resetReport,
      });

      // Save report to database (if table exists)
      try {
        await supabase.from('reset_reports').insert({
          ...this.resetReport,
        });
        console.log('✓ Reset report saved');
      } catch (e) {
        console.log('⚠ reset_reports table not available, skipping report save');
      }

      this.emitProgress({
        phase: 'Complete',
        progress: 100,
        totalPhases,
        currentPhase,
        details: 'Database reset completed successfully!',
      });

      return this.resetReport;

    } catch (error) {
      this.resetReport.status = 'failed';
      this.resetReport.completed_at = new Date().toISOString();
      
      await this.logAuditEvent('reset_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get number of phases for progress tracking
   */
  private getPhasesCount(level: ResetLevel): number {
    let phases = 2; // archive + financial
    if (level !== 'level_1_financial') phases++; // operational
    if (level === 'level_3_organization') phases++; // organization
    phases += 3; // audit logs (optional) + reseed + verification
    return phases;
  }

  /**
   * Delete all financial records
   */
  private async deleteFinancialRecords(): Promise<void> {
    const supabase = await createServiceClient();
    
    // Delete in order (respecting foreign keys)
    const tables = ['transactions', 'fines', 'loans', 'campaigns', 'accounts'];
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table as any)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) {
        console.error(`Error deleting ${table}:`, error);
      } else {
        console.log(`✓ Deleted all records from ${table}`);
      }
    }
  }

  /**
   * Delete operational records
   */
  private async deleteOperationalRecords(): Promise<void> {
    const supabase = await createServiceClient();
    
    const tables = ['documents', 'compliance_records'];
    
    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
          console.warn(`Warning deleting ${table}:`, error.message);
        } else {
          console.log(`✓ Deleted all records from ${table}`);
        }
      } catch (e) {
        // Table might not exist, skip
        console.log(`⚠ Table ${table} does not exist, skipping`);
      }
    }

    // Additional tables that may not exist
    const optionalTables = ['meetings', 'notifications', 'reports', 'meeting_attendance'];
    
    for (const table of optionalTables) {
      try {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
          console.warn(`Warning deleting ${table}:`, error.message);
        } else {
          console.log(`✓ Deleted all records from ${table}`);
        }
      } catch (e) {
        // Table doesn't exist, skip
        console.log(`⚠ Table ${table} does not exist, skipping`);
      }
    }
  }

  /**
   * Delete organization records (Level 3)
   */
  private async deleteOrganizationRecords(): Promise<void> {
    const supabase = await createServiceClient();
    
    // First archive members and users before deletion
    const archiveId = this.resetReport?.archive_id;
    let archivesAvailable = true;
    
    try {
      await supabase.from('archives').select('id').limit(1);
    } catch (e) {
      console.log('Archives table not available');
      archivesAvailable = false;
    }
    
    if (archiveId && archivesAvailable) {
      // Archive members
      const { data: members } = await supabase.from('members').select('*');
      if (members && members.length > 0) {
        await supabase.from('archives').insert({
          id: uuidv4(),
          archive_id: archiveId,
          table_name: 'members',
          records: members,
          record_count: members.length,
          reset_level: 'level_3_organization',
          created_at: new Date().toISOString(),
        });
        console.log(`✓ Archived ${members.length} members`);
      }
      
      // Archive users (except super admin)
      const { data: users } = await supabase.from('users').select('*').neq('role', 'super_admin');
      if (users && users.length > 0) {
        await supabase.from('archives').insert({
          id: uuidv4(),
          archive_id: archiveId,
          table_name: 'users',
          records: users,
          record_count: users.length,
          reset_level: 'level_3_organization',
          created_at: new Date().toISOString(),
        });
        console.log(`✓ Archived ${users.length} users`);
      }
    }
    
    // Delete non-super-admin users
    await supabase.from('users').delete().neq('role', 'super_admin');
    console.log('✓ Deleted non-admin users');
    
    // Delete members
    await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('✓ Deleted all members');
  }

  /**
   * Reseed default data
   */
  private async reseedDefaultData(level: ResetLevel): Promise<void> {
    const supabase = await createServiceClient();
    
    // Reseed default campaigns
    const campaignsExist = await supabase.from('campaigns').select('id').limit(1);
    
    if (!campaignsExist.data || campaignsExist.data.length === 0) {
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
      console.log('✓ Reseeded default campaigns');
    }
  }

  /**
   * Run integrity verification
   */
  private async runIntegrityVerification(): Promise<{ passed: boolean; errors: string[] }> {
    const supabase = await createServiceClient();
    const errors: string[] = [];
    
    // Verify all accounts are deleted (except for Level 1/2)
    const { count: accountsCount } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });
    
    if (accountsCount && accountsCount > 0) {
      errors.push(`Found ${accountsCount} orphaned account records`);
    }
    
    // Verify transactions are deleted
    const { count: txnCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });
    
    if (txnCount && txnCount > 0) {
      errors.push(`Found ${txnCount} orphaned transaction records`);
    }
    
    // Verify system state is clean
    const systemState = await this.getSystemState();
    
    if (systemState.savings_balance > 0) {
      errors.push(`Savings balance not zero: ${systemState.savings_balance}`);
    }
    if (systemState.loans_balance > 0) {
      errors.push(`Loans balance not zero: ${systemState.loans_balance}`);
    }
    if (systemState.fines_balance > 0) {
      errors.push(`Fines balance not zero: ${systemState.fines_balance}`);
    }
    
    // Verify settings still exist
    const { count: settingsCount } = await supabase
      .from('settings')
      .select('*', { count: 'exact', head: true });
    
    if (!settingsCount || settingsCount === 0) {
      errors.push('Settings table is empty - critical system settings missing');
    }
    
    const passed = errors.length === 0;
    
    console.log(passed ? '✅ Integrity verification passed' : `❌ Verification failed: ${errors.join(', ')}`);
    
    return { passed, errors };
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(action: string, details: any): Promise<void> {
    const supabase = await createServiceClient();
    
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: `system.${action}`,
      record_id: this.resetReport?.id || 'system',
      user_id: this.resetReport?.initiated_by || 'system',
      after_value: details,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Verify user password
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const supabase = await createServiceClient();
    
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .eq('role', 'super_admin')
      .single();
    
    if (!user) return false;
    
    // Simple hash comparison (in production, use bcrypt)
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    
    return user.password_hash === hash;
  }

  /**
   * Get reset level configuration
   */
  getResetLevelConfig(level: ResetLevel) {
    return RESET_LEVEL_CONFIG[level];
  }
}

export const databaseResetService = new DatabaseResetService();
