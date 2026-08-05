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

      // ============ DOCUMENTS ============
      documents: {
        Row: {
          id: string;
          member_id: string;
          document_type: string;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          uploaded_by: string;
          uploaded_at: string;
          verified: boolean;
          verified_by: string | null;
          verified_at: string | null;
          expiry_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
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
        };
        Insert: Omit<Database['public']['Tables']['user_management_audit']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };

      // ============ SETTINGS ============
      settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          description: string | null;
          category: 'organization' | 'financial' | 'membership' | 'loan' | 'system';
          is_encrypted: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['settings']['Row'], 'id' | 'updated_at'> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
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

// User role types
export type UserRole = 'super_admin' | 'admin' | 'staff' | 'viewer';

// Extended user type with profile fields
export interface UserProfile extends User {
  avatar_url?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  date_joined?: string | null;
  failed_login_attempts?: number;
  locked_until?: string | null;
  password_changed_at?: string | null;
  must_change_password?: boolean;
}
