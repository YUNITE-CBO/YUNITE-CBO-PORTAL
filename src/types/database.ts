export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      // ============ ORGANIZATION ============
      organizations: {
        Row: {
          id: string;
          name: string;
          registration_number: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };

      // ============ USERS & AUTH ============
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string | null;
          full_name: string;
          phone: string | null;
          role: 'super_admin' | 'admin' | 'staff' | 'viewer';
          is_active: boolean;
          last_login: string | null;
          created_at: string;
          updated_at: string;
          date_joined: string | null;
          email_verified: boolean;
          email_verified_at: string | null;
          verification_token: string | null;
          verification_token_expires: string | null;
          is_system_user: boolean;
          is_protected: boolean;
          department: string | null;
          job_title: string | null;
          employee_id: string | null;
          password_history: Json;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_expires_at: string | null;
          archived_at: string | null;
          archived_by: string | null;
          archive_reason: string | null;
          admin_notes: string | null;
          total_logins: number;
          last_active_at: string | null;
          account_status: string;
          failed_login_attempts: number;
          locked_until: string | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };

      // ============ MEMBERS ============
      members: {
        Row: {
          id: string;
          member_number: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string;
          id_number: string | null;
          date_of_birth: string | null;
          gender: 'male' | 'female' | 'other' | null;
          physical_address: string | null;
          postal_address: string | null;
          occupation: string | null;
          employer: string | null;
          employer_address: string | null;
          next_of_kin_name: string | null;
          next_of_kin_phone: string | null;
          next_of_kin_relationship: string | null;
          registration_date: string;
          status: 'pending' | 'active' | 'suspended' | 'withdrawn' | 'deceased';
          profile_photo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['members']['Row'], 'id' | 'member_number' | 'created_at' | 'updated_at'> & {
          id?: string;
          member_number?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['members']['Insert']>;
      };

      // ============ ACCOUNTS ============
      accounts: {
        Row: {
          id: string;
          member_id: string;
          account_type: 'savings' | 'shares' | 'contributions' | 'welfare' | 'fines' | 'loans';
          account_number: string;
          balance: number;
          status: 'active' | 'frozen' | 'closed';
          opened_at: string;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['accounts']['Row'], 'id' | 'account_number' | 'created_at' | 'updated_at'> & {
          id?: string;
          account_number?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['accounts']['Insert']>;
      };

      // ============ TRANSACTIONS ============
      transactions: {
        Row: {
          id: string;
          transaction_ref: string;
          account_id: string;
          member_id: string;
          transaction_type: 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'fine' | 'loan_disbursement' | 'loan_repayment' | 'contribution' | 'share_purchase' | 'interest' | 'adjustment' | 'reversal';
          amount: number;
          balance_before: number;
          balance_after: number;
          description: string | null;
          reference_number: string | null;
          posted_by: string;
          posted_at: string;
          reversed: boolean;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'transaction_ref' | 'created_at'> & {
          id?: string;
          transaction_ref?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };

      // ============ LOANS ============
      loans: {
        Row: {
          id: string;
          loan_number: string;
          member_id: string;
          principal_amount: number;
          interest_rate: number;
          interest_amount: number;
          total_amount: number;
          amount_paid: number;
          amount_due: number;
          loan_type: string;
          purpose: string | null;
          application_date: string;
          approval_date: string | null;
          disbursement_date: string | null;
          repayment_start_date: string | null;
          repayment_end_date: string | null;
          repayment_period_months: number;
          monthly_repayment: number;
          status: 'pending' | 'approved' | 'disbursed' | 'active' | 'completed' | 'defaulted' | 'written_off' | 'rejected';
          approved_by: string | null;
          disbursed_by: string | null;
          collateral_description: string | null;
          guarantor_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['loans']['Row'], 'id' | 'loan_number' | 'created_at' | 'updated_at'> & {
          id?: string;
          loan_number?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['loans']['Insert']>;
      };

      // ============ FINES ============
      fines: {
        Row: {
          id: string;
          fine_number: string;
          member_id: string;
          fine_type: string;
          amount: number;
          amount_paid: number;
          reason: string;
          issued_by: string;
          issued_date: string;
          due_date: string | null;
          paid_date: string | null;
          status: 'pending' | 'partial' | 'paid' | 'waived' | 'written_off';
          waived_by: string | null;
          waived_at: string | null;
          waiver_reason: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['fines']['Row'], 'id' | 'fine_number' | 'created_at' | 'updated_at'> & {
          id?: string;
          fine_number?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fines']['Insert']>;
      };

      // ============ CONTRIBUTIONS ============
      contribution_campaigns: {
        Row: {
          id: string;
          campaign_name: string;
          description: string | null;
          target_amount: number | null;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['contribution_campaigns']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contribution_campaigns']['Insert']>;
      };

      contribution_payments: {
        Row: {
          id: string;
          member_id: string;
          campaign_id: string;
          amount: number;
          payment_date: string;
          payment_method: string | null;
          reference: string | null;
          posted_by: string;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['contribution_payments']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contribution_payments']['Insert']>;
      };

      // ============ COMPLIANCE ============
      compliance_records: {
        Row: {
          id: string;
          member_id: string;
          compliance_type: string;
          status: 'compliant' | 'pending' | 'non_compliant';
          due_date: string | null;
          completed_date: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['compliance_records']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['compliance_records']['Insert']>;
      };

      // ============ AUDIT LOG ============
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          table_name: string | null;
          record_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      // ============ USER SESSIONS ============
      user_sessions: {
        Row: {
          id: string;
          user_id: string;
          session_token: string;
          ip_address: string | null;
          user_agent: string | null;
          device_info: Json | null;
          location_info: Json | null;
          is_active: boolean;
          created_at: string;
          last_activity_at: string;
          expires_at: string | null;
          terminated_at: string | null;
          termination_reason: string | null;
        };
        Insert: Omit<Database['public']['Tables']['user_sessions']['Row'], 'id' | 'created_at' | 'last_activity_at'> & {
          id?: string;
          created_at?: string;
          last_activity_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_sessions']['Insert']>;
      };

      // ============ LOGIN ACTIVITY ============
      login_activity: {
        Row: {
          id: string;
          user_id: string | null;
          email: string | null;
          event_type: 'login_success' | 'login_failed' | 'logout' | 'password_changed' | 'password_reset_requested' | 'password_reset_completed' | 'session_expired' | 'session_terminated' | 'account_locked' | 'account_unlocked' | 'mfa_enabled' | 'mfa_disabled' | 'role_changed' | 'email_changed';
          ip_address: string | null;
          user_agent: string | null;
          device_info: Json | null;
          location_info: Json | null;
          metadata: Json | null;
          success: boolean;
          failure_reason: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['login_activity']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      // ============ NOTIFICATION PREFERENCES ============
      notification_preferences: {
        Row: {
          id: string;
          user_id: string;
          notify_on_login: boolean;
          notify_on_logout: boolean;
          notify_on_password_change: boolean;
          notify_on_profile_update: boolean;
          email_notifications: boolean;
          in_app_notifications: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notification_preferences']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };

      // ============ USER MANAGEMENT AUDIT ============
      user_management_audit: {
        Row: {
          id: string;
          admin_user_id: string;
          target_user_id: string;
          action: 'user_created' | 'user_updated' | 'user_deleted' | 'role_changed' | 'status_changed' | 'password_reset' | 'account_locked' | 'account_unlocked' | 'email_changed';
          old_values: Json | null;
          new_values: Json | null;
          reason: string | null;
          ip_address: string | null;
          created_at: string;
          module: string | null;
          user_agent: string | null;
          session_id: string | null;
          previous_status: string | null;
          new_status: string | null;
          metadata: Json;
        };
        Insert: Omit<Database['public']['Tables']['user_management_audit']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      // ============ BOOTSTRAP LOGS ============
      bootstrap_logs: {
        Row: {
          id: string;
          operation_type: 'super_admin_bootstrap' | 'system_initialization' | 'database_migration' | 'cache_warmup' | 'notification_setup';
          status: 'success' | 'failed' | 'skipped' | 'warning';
          action_taken: string | null;
          message: string | null;
          details: Json;
          duration_ms: number | null;
          environment: string;
          metadata: Json;
          error_trace: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bootstrap_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bootstrap_logs']['Insert']>;
      };

      // ============ SETTINGS (Enhanced) ============
      settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          description: string | null;
          category: 'organization' | 'financial' | 'membership' | 'loan' | 'system' | 'security' | 'smtp' | 'welfare' | 'contributions';
          is_encrypted: boolean;
          updated_by: string | null;
          updated_at: string;
          config_category_id: string | null;
          data_type: 'string' | 'number' | 'boolean' | 'json' | 'password';
          validation_pattern: string | null;
          min_value: number | null;
          max_value: number | null;
          options: Json | null;
          is_public: boolean;
          display_order: number;
          help_text: string | null;
        };
        Insert: Omit<Database['public']['Tables']['settings']['Row'], 'id' | 'updated_at'> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
      };

      // ============ CONFIGURATION CATEGORIES ============
      configuration_categories: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          icon: string | null;
          color: string;
          sort_order: number;
          is_active: boolean;
          parent_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['configuration_categories']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['configuration_categories']['Insert']>;
      };

      // ============ SETTINGS GROUPS ============
      settings_groups: {
        Row: {
          id: string;
          category_id: string | null;
          code: string;
          name: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['settings_groups']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settings_groups']['Insert']>;
      };

      // ============ CONFIGURATION HISTORY ============
      configuration_history: {
        Row: {
          id: string;
          setting_key: string;
          old_value: string | null;
          new_value: string | null;
          old_value_masked: string | null;
          new_value_masked: string | null;
          changed_by: string | null;
          changed_by_name: string | null;
          reason: string | null;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['configuration_history']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      // ============ DOCUMENT CATEGORIES ============
      document_categories: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          module: string;
          is_required: boolean;
          is_active: boolean;
          sort_order: number;
          allowed_mime_types: string[] | null;
          max_file_size_mb: number;
          retention_days: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['document_categories']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['document_categories']['Insert']>;
      };

      // ============ DOCUMENTS (Enhanced) ============
      documents: {
        Row: {
          id: string;
          member_id: string;
          document_type: 'national_id' | 'passport' | 'photo' | 'kra_pin' | 'membership_form' | 'contract' | 'certificate' | 'other';
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          storage_bucket: string;
          storage_path: string | null;
          expiry_date: string | null;
          status: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'verified' | 'expired' | 'archived' | 'deleted';
          verified_by: string | null;
          verified_at: string | null;
          uploaded_by: string | null;
          uploaded_at: string;
          is_archived: boolean;
          archived_at: string | null;
          archived_by: string | null;
          version: number;
          parent_document_id: string | null;
          metadata: Json | null;
          checksum: string | null;
          original_file_name: string | null;
          created_at: string;
          // New columns from migration 017
          document_ref: string | null;
          category_code: string | null;
          module: string | null;
          entity_type: string | null;
          entity_id: string | null;
          is_verified: boolean;
          is_expired: boolean;
          reminder_sent: boolean;
          reminder_count: number;
          uploaded_by_name: string | null;
          ip_address: string | null;
          verification_notes: string | null;
          visibility: 'public' | 'authenticated' | 'admin' | 'owner';
        };
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'created_at' | 'is_verified' | 'is_expired' | 'reminder_sent' | 'reminder_count' | 'visibility'> & {
          id?: string;
          created_at?: string;
          is_verified?: boolean;
          is_expired?: boolean;
          reminder_sent?: boolean;
          reminder_count?: number;
          visibility?: 'public' | 'authenticated' | 'admin' | 'owner';
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
      };

      // ============ MEMBER COMPLIANCE ============
      member_compliance: {
        Row: {
          id: string;
          member_id: string;
          document_category_id: string | null;
          document_category_code: string;
          document_id: string | null;
          status: 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'not_required';
          submitted_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_notes: string | null;
          expiry_date: string | null;
          next_review_date: string | null;
          reminder_sent: boolean;
          reminder_count: number;
          last_reminder_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['member_compliance']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['member_compliance']['Insert']>;
      };

      // ============ MEMBER APPROVAL WORKFLOW ============
      member_approval_workflow: {
        Row: {
          id: string;
          member_id: string;
          current_stage: 'documentation' | 'review' | 'approval' | 'completed' | 'rejected';
          required_documents_complete: boolean;
          compliance_score: number;
          notes: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          approved_at: string | null;
          approved_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['member_approval_workflow']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['member_approval_workflow']['Insert']>;
      };

      // ============ FILE UPLOADS ============
      file_uploads: {
        Row: {
          id: string;
          file_name: string;
          original_name: string;
          file_path: string;
          storage_bucket: string;
          file_size: number;
          mime_type: string;
          checksum: string | null;
          module: string;
          entity_type: string;
          entity_id: string;
          document_category_id: string | null;
          uploaded_by: string | null;
          uploaded_by_name: string | null;
          ip_address: string | null;
          status: 'active' | 'archived' | 'deleted';
          archived_at: string | null;
          archived_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          deletion_reason: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['file_uploads']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['file_uploads']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience type aliases
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type User = Database['public']['Tables']['users']['Row'];
export type Member = Database['public']['Tables']['members']['Row'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Loan = Database['public']['Tables']['loans']['Row'];
export type Fine = Database['public']['Tables']['fines']['Row'];
export type ContributionCampaign = Database['public']['Tables']['contribution_campaigns']['Row'];
export type ContributionPayment = Database['public']['Tables']['contribution_payments']['Row'];
export type Document = Database['public']['Tables']['documents']['Row'];
export type ComplianceRecord = Database['public']['Tables']['compliance_records']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type Setting = Database['public']['Tables']['settings']['Row'];
export type UserSession = Database['public']['Tables']['user_sessions']['Row'];
export type LoginActivity = Database['public']['Tables']['login_activity']['Row'];
export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row'];
export type UserManagementAudit = Database['public']['Tables']['user_management_audit']['Row'];

// Phase 4 type aliases
export type ConfigurationCategory = Database['public']['Tables']['configuration_categories']['Row'];
export type SettingsGroup = Database['public']['Tables']['settings_groups']['Row'];
export type ConfigurationHistory = Database['public']['Tables']['configuration_history']['Row'];
export type DocumentCategory = Database['public']['Tables']['document_categories']['Row'];
export type MemberCompliance = Database['public']['Tables']['member_compliance']['Row'];
export type MemberApprovalWorkflow = Database['public']['Tables']['member_approval_workflow']['Row'];
export type FileUpload = Database['public']['Tables']['file_uploads']['Row'];

// User role types
export type UserRole = 'super_admin' | 'admin' | 'staff' | 'viewer';

// Extended user type with profile fields
export interface UserProfile extends User {
  avatar_url?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  password_changed_at?: string | null;
  must_change_password?: boolean;
}
