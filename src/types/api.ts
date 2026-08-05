import { Member, Account, Transaction, Loan, Fine, User, Setting } from './database';

// ===========================================
// API Response Types
// ===========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ===========================================
// Member Types
// ===========================================

export interface MemberRegistration {
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  id_number?: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  physical_address?: string;
  postal_address?: string;
  occupation?: string;
  employer?: string;
  employer_address?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relationship?: string;
}

export interface MemberProfile extends Member {
  accounts: Account[];
  active_loans: Loan[];
  pending_fines: Fine[];
  recent_transactions: Transaction[];
}

export interface MemberSearchParams {
  query?: string;
  member_number?: string;
  phone?: string;
  status?: Member['status'];
  page?: number;
  limit?: number;
}

// ===========================================
// Transaction Types
// ===========================================

export interface TransactionCreate {
  member_id: string;
  account_type: Account['account_type'];
  transaction_type: Transaction['transaction_type'];
  amount: number;
  description?: string;
  reference_number?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionReversal {
  transaction_id: string;
  reason: string;
}

// ===========================================
// Loan Types
// ===========================================

export interface LoanApplication {
  member_id: string;
  loan_type: string;
  principal_amount: number;
  interest_rate?: number;
  repayment_period_months?: number;
  purpose?: string;
  collateral_description?: string;
  guarantor_id?: string;
}

export interface LoanApproval {
  loan_id: string;
  approved_amount: number;
  interest_rate: number;
  repayment_period_months: number;
  notes?: string;
}

export interface LoanDisbursement {
  loan_id: string;
  account_type?: Account['account_type'];
  notes?: string;
}

// ===========================================
// Fine Types
// ===========================================

export interface FineCreate {
  member_id: string;
  fine_type: string;
  amount: number;
  reason: string;
  due_date?: string;
  notes?: string;
}

export interface FinePayment {
  fine_id: string;
  amount: number;
  notes?: string;
}

export interface FineWaiver {
  fine_id: string;
  reason: string;
}

// ===========================================
// Contribution Types
// ===========================================

export interface CampaignCreate {
  campaign_name: string;
  description?: string;
  target_amount?: number;
  start_date: string;
  end_date?: string;
}

export interface ContributionPayment {
  member_id: string;
  campaign_id: string;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  reference?: string;
  notes?: string;
}

// ===========================================
// Document Types
// ===========================================

export interface DocumentUpload {
  member_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  expiry_date?: string;
  notes?: string;
}

// ===========================================
// Settings Types
// ===========================================

export interface SettingUpdate {
  key: string;
  value: string;
  description?: string;
  category?: Setting['category'];
}

// ===========================================
// Dashboard Types
// ===========================================

export interface DashboardStats {
  total_members: number;
  active_members: number;
  new_registrations: number;
  total_savings: number;
  total_shares: number;
  total_loans_disbursed: number;
  total_loans_outstanding: number;
  total_fines_pending: number;
  total_contributions: number;
}

export interface RecentActivity {
  id: string;
  type: 'member_registration' | 'deposit' | 'withdrawal' | 'loan_application' | 'loan_disbursement' | 'fine_issued' | 'payment';
  description: string;
  member_name?: string;
  amount?: number;
  user_name: string;
  created_at: string;
}

// ===========================================
// Auth Types
// ===========================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface LoginResponse {
  success: boolean;
  user: AuthUser;
  token: string;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'staff' | 'viewer';
  avatar_url?: string | null;
  phone?: string | null;
  is_active: boolean;
}

export interface CurrentUser extends AuthUser {
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  date_joined?: string | null;
  last_login?: string | null;
  must_change_password?: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

// ===========================================
// User Management Types
// ===========================================

export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: User['role'];
}

export interface UserUpdate {
  full_name?: string;
  phone?: string;
  role?: User['role'];
  is_active?: boolean;
  password?: string;
}

export interface UserProfileUpdate {
  full_name?: string;
  phone?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  avatar_url?: string;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface LoginActivityLog {
  id: string;
  user_id: string | null;
  email: string | null;
  event_type: string;
  ip_address: string | null;
  device_info: Record<string, unknown> | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

export interface SessionInfo {
  id: string;
  device_info: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  last_activity_at: string;
  is_current: boolean;
}
