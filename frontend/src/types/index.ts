// Core Types for YUNITE Banking System Admin Portal

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  branchId: string;
  avatar?: string;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  type: 'sacco' | 'chama' | 'cooperative' | 'ngo' | 'other';
  status: 'active' | 'inactive';
  registrationNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  logo?: string;
  memberCount: number;
  createdAt: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  location?: string;
  status: 'active' | 'inactive';
  managerId?: string;
  createdAt: string;
}

export interface Member {
  id: string;
  organizationId: string;
  branchId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone: string;
  idNumber: string;
  kraPin?: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  maritalStatus?: string;
  occupation?: string;
  employer?: string;
  photo?: string;
  status: 'active' | 'inactive' | 'suspended' | 'dormant';
  joinedDate: string;
  membershipType: 'regular' | 'premium' | 'honorary' | 'associate';
  createdAt: string;
  // Financial Summary
  savingsBalance: number;
  sharesValue: number;
  loanBalance: number;
  totalContributions: number;
}

export interface SavingsAccount {
  id: string;
  memberId: string;
  accountNumber: string;
  type: 'regular' | 'fixed' | 'target' | 'education' | 'emergency';
  balance: number;
  interestRate: number;
  status: 'active' | 'frozen' | 'closed' | 'dormant';
  openedDate: string;
  closedDate?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  memberId: string;
  loanNumber: string;
  type: 'normal' | 'emergency' | 'development' | 'education' | 'asset';
  amount: number;
  disbursedAmount: number;
  balance: number;
  interestRate: number;
  duration: number;
  repaymentPeriod: 'weekly' | 'monthly' | 'quarterly' | 'lump_sum';
  status: 'pending' | 'approved' | 'disbursed' | 'active' | 'overdue' | 'defaulted' | 'paid' | 'written_off';
  appliedDate: string;
  approvedDate?: string;
  disbursedDate?: string;
  dueDate?: string;
  paidDate?: string;
  guarantors: LoanGuarantor[];
  createdAt: string;
}

export interface LoanGuarantor {
  id: string;
  loanId: string;
  memberId: string;
  memberName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
}

export interface Repayment {
  id: string;
  loanId: string;
  memberId: string;
  receiptNumber: string;
  amount: number;
  principal: number;
  interest: number;
  penalty: number;
  method: 'cash' | 'mpesa' | 'bank' | 'salary' | 'savings';
  reference?: string;
  paidDate: string;
  status: 'completed' | 'pending' | 'reversed';
  reversedAt?: string;
}

export interface Share {
  id: string;
  memberId: string;
  certificateNumber: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  status: 'active' | 'redeemed';
  purchaseDate: string;
  redeemedDate?: string;
}

export interface Contribution {
  id: string;
  memberId: string;
  type: string;
  amount: number;
  period: string;
  paidDate: string;
  status: 'paid' | 'pending' | 'waived';
  method: string;
  reference?: string;
}

export interface Fine {
  id: string;
  memberId: string;
  type: 'late_payment' | 'late_meeting' | 'default' | 'other';
  amount: number;
  reason: string;
  imposedDate: string;
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'waived';
  waivedBy?: string;
}

export interface Meeting {
  id: string;
  organizationId: string;
  title: string;
  type: 'regular' | 'special' | 'annual' | 'emergency';
  date: string;
  time: string;
  venue: string;
  agenda: string[];
  minutes?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  attendance: number;
  totalMembers: number;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  budget: number;
  spent: number;
  startDate: string;
  endDate?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  manager: string;
  members: number;
  progress: number;
}

export interface Transaction {
  id: string;
  organizationId: string;
  reference: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'fee' | 'dividend' | 'interest';
  amount: number;
  balance: number;
  description: string;
  category?: string;
  method: string;
  status: 'completed' | 'pending' | 'failed' | 'reversed';
  createdBy: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  debits: JournalLine[];
  credits: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: 'draft' | 'posted' | 'reversed';
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  type: 'debit' | 'credit';
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  category: string;
  balance: number;
  status: 'active' | 'inactive';
  description?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface AIInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  recommendation?: string;
  data: Record<string, any>;
  createdAt: string;
}

export interface DashboardMetrics {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  savingsBalance: number;
  sharesValue: number;
  loanPortfolio: number;
  outstandingLoans: number;
  overdueLoans: number;
  revenue: number;
  expenses: number;
  netIncome: number;
  cashPosition: number;
  activeProjects: number;
  pendingApprovals: number;
  unreadNotifications: number;
  organizationHealthScore: number;
  financialHealthScore: number;
  dataQualityScore: number;
  systemHealthScore: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface TableFilters {
  search: string;
  status?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: string;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  children?: SidebarItem[];
}