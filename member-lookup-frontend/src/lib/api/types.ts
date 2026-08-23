/**
 * Type definitions mirroring the REAL YUNITE backend API response shapes
 * (verified against the live `/api/v1` endpoints). These are transport
 * shapes only — the backend is the source of truth for every field.
 */

export interface Member {
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
  created_at: string;
  updated_at: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  preferred_language?: string | null;
  preferred_contact_method?: string | null;
  sms_notifications?: boolean;
}

export interface CalculatedBalances {
  savings: number;
  shares: number;
  contributions: number;
  welfare: number;
  fines: number;
  loans: number;
}

export interface MemberBalances {
  member_id: string;
  balances: CalculatedBalances;
}

export type TransactionType =
  | 'savings_deposit'
  | 'savings_withdrawal'
  | 'savings_adjustment'
  | 'registration_fee'
  | 'annual_fee'
  | 'contribution_monthly'
  | 'contribution_special'
  | 'contribution_development'
  | 'welfare_deposit'
  | 'welfare_disbursement'
  | 'fine_posting'
  | 'fine_payment'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'reversal';

export interface Transaction {
  id: string;
  transaction_ref: string;
  member_id: string;
  account_id: string;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference_number: string | null;
  posted_by: string | null;
  posted_at: string;
  reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export type LoanStatus = 'pending' | 'approved' | 'disbursed' | 'active' | 'completed' | 'defaulted';

export interface Loan {
  id: string;
  loan_number: string;
  member_id: string;
  loan_type: string;
  principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  repayment_period_months: number;
  monthly_repayment: number;
  disbursement_date: string | null;
  repayment_start_date: string | null;
  repayment_end_date: string | null;
  disbursed_by: string | null;
  purpose: string | null;
  status: LoanStatus;
  created_at: string;
  updated_at: string;
}

export type FineStatus = 'pending' | 'partial' | 'paid' | 'waived';
export type FineType = 'meeting_absence' | 'late_payment' | 'penalty' | 'manual' | 'other';

export interface Fine {
  id: string;
  fine_number: string;
  member_id: string;
  fine_type: FineType;
  amount: number;
  amount_paid: number;
  reason: string;
  due_date: string | null;
  issued_by: string | null;
  issued_date: string;
  status: FineStatus;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
  waived_date?: string | null;
  waived_by?: string | null;
  waiver_reason?: string | null;
  member?: { last_name: string; first_name: string; member_number: string };
}

export interface ContributionRow {
  id: string;
  transaction_ref: string;
  member_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_number: string | null;
  metadata?: Record<string, unknown> | null;
  posted_at: string;
  created_at: string;
  member?: { id: string; last_name: string; first_name: string; member_number: string };
}

export interface WelfareRow {
  id: string;
  transaction_ref: string;
  member_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_number: string | null;
  posted_at: string;
  created_at: string;
}

export interface Notification {
  id: string;
  subject: string | null;
  body: string | null;
  title?: string | null;
  message?: string | null;
  status?: string;
  priority?: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface SupportTicket {
  id: string;
  ticket_reference: string;
  member_id: string;
  category: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: string;
  source: string;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSetting {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  category?: string | null;
  data_type?: string | null;
  help_text?: string | null;
}

export interface Meeting {
  id: string;
  meeting_number: string;
  meeting_title: string;
  meeting_type?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  agenda?: string | null;
  chairperson?: string | null;
  secretary?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
