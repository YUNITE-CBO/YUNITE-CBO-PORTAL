# YUNITE Enterprise Operating System - Release 1.0.1

## Architecture Specification

### Core Principle
**Every piece of data has one owner, one source of truth, and one place where it is maintained.**

---

## Release 1.0.1 Summary
- Added Member Lookup workspace for verification
- Added functional Quick Actions on Member Detail (savings, contributions, fines)
- Added Transaction reversal with audit trail
- Added Audit Log viewer for compliance
- Improved navigation with all workspaces accessible

---

## 1. Data Architecture

### 1.1 Single Source of Truth
All balances are **derived from transaction history**, never stored as duplicate values:

| Balance Type | Source | Calculation |
|--------------|--------|-------------|
| Savings Balance | Transaction Ledger | SUM(deposits) - SUM(withdrawals) |
| Shares Balance | Savings + Settings | Total Savings ÷ Share Value |
| Loan Balance | Loan Ledger | SUM(disbursements) - SUM(repayments) |
| Fine Balance | Fine Ledger | SUM(fines) - SUM(payments) |
| Contribution Balance | Transaction Ledger | SUM(contributions) |
| Welfare Balance | Transaction Ledger | SUM(welfare transactions) |

### 1.2 Member-Centric Design
- Member is the center of the entire platform
- Every financial record, document, account, statement, transaction belongs to ONE member
- Member exists only once in the system
- Every workspace references the Member ID

---

## 2. Database Schema

### 2.1 Core Tables

```
organizations
├── id (UUID, PK)
├── name
├── registration_number
├── email, phone, address
├── currency
├── created_at, updated_at

members
├── id (UUID, PK)
├── member_number (unique, auto-generated)
├── first_name, last_name
├── email, phone
├── id_number
├── date_of_birth, gender
├── physical_address, postal_address
├── occupation, employer
├── next_of_kin_name, next_of_kin_phone, next_of_kin_relationship
├── registration_date
├── status (pending | active | suspended | withdrawn | deceased)
├── created_at, updated_at

accounts (logical workspaces per member)
├── id (UUID, PK)
├── member_id (FK → members)
├── account_type (savings | shares | contributions | welfare | fines | loans)
├── status (active | closed | frozen)
├── created_at, updated_at

transactions (AUTHORITATIVE LEDGER - single source of truth)
├── id (UUID, PK)
├── transaction_ref (unique, auto-generated)
├── member_id (FK → members)
├── account_id (FK → accounts)
├── transaction_type
├── amount (always positive)
├── balance_before (snapshot)
├── balance_after (snapshot)
├── description
├── reference_number
├── posted_by (FK → users)
├── posted_at
├── reversed (boolean)
├── reversed_at, reversed_by, reversal_reason
├── metadata (JSONB)

fines
├── id (UUID, PK)
├── fine_number (unique)
├── member_id (FK → members)
├── fine_type (meeting_absence | late_payment | penalty | manual)
├── amount
├── amount_paid
├── reason
├── due_date
├── issued_by, issued_date
├── status (pending | partial | paid | waived)
├── paid_date
├── created_at, updated_at

loans
├── id (UUID, PK)
├── loan_number (unique)
├── member_id (FK → members)
├── loan_type
├── principal_amount
├── interest_rate
├── interest_amount
├── total_amount
├── amount_paid
├── amount_due
├── repayment_period_months
├── monthly_repayment
├── disbursement_date
├── repayment_start_date
├── repayment_end_date
├── disbursed_by
├── status (pending | approved | disbursed | active | completed | defaulted)
├── created_at, updated_at

documents
├── id (UUID, PK)
├── member_id (FK → members)
├── document_type (national_id | passport | photo | kra_pin | other)
├── file_name
├── file_path
├── expiry_date
├── status (pending | verified | expired)
├── verified_by, verified_at
├── uploaded_by, uploaded_at
├── created_at, updated_at

compliance_records
├── id (UUID, PK)
├── member_id (FK → members)
├── compliance_type
├── status (pending | complete | missing | expired)
├── due_date
├── completed_date
├── notes
├── created_at, updated_at

audit_logs (IMmutable)
├── id (UUID, PK)
├── user_id (FK → users)
├── action (table.operation)
├── record_id
├── before_value (JSONB)
├── after_value (JSONB)
├── reason
├── ip_address
├── created_at

settings (Configuration)
├── id (UUID, PK)
├── key (unique, namespaced)
├── value
├── description
├── category
├── updated_by, updated_at
```

### 2.2 Indexes
```sql
CREATE INDEX idx_transactions_member_id ON transactions(member_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_posted_at ON transactions(posted_at);
CREATE INDEX idx_members_member_number ON members(member_number);
CREATE INDEX idx_members_phone ON members(phone);
```

---

## 3. Transaction Engine

### 3.1 Core Principle
**Every financial operation passes through the Transaction Engine. No module directly updates balances.**

### 3.2 Transaction Flow
```
Request → Validate → Create Transaction → Update Ledger → 
Recalculate Balances → Generate Audit Log → Update Dashboard → 
Update Statements → Notify Services
```

### 3.3 Supported Transaction Types
| Type | Category | Effect |
|------|----------|--------|
| savings_deposit | savings | +amount |
| savings_withdrawal | savings | -amount |
| savings_adjustment | savings | ±amount |
| registration_fee | fees | -amount |
| annual_fee | fees | -amount |
| contribution_monthly | contributions | +amount |
| contribution_special | contributions | +amount |
| contribution_development | contributions | +amount |
| welfare_deposit | welfare | +amount |
| welfare_disbursement | welfare | -amount |
| fine_posting | fines | +amount |
| fine_payment | fines | -amount |
| loan_disbursement | loans | -amount |
| loan_repayment | loans | +amount |
| reversal | all | Undo original |

### 3.4 Balance Calculation Functions
```typescript
// Get Savings Balance - NEVER stored, always calculated
function getSavingsBalance(memberId: string): number {
  const deposits = SUM(transactions WHERE type='savings_deposit' AND member_id)
  const withdrawals = SUM(transactions WHERE type='savings_withdrawal' AND member_id)
  const adjustments = SUM(transactions WHERE type='savings_adjustment' AND member_id)
  return deposits - withdrawals + adjustments
}

// Get Shares - Derived from Savings
function getSharesBalance(memberId: string): number {
  const shareValue = getSetting('shares.share_value') // e.g., 100 KES
  const savingsBalance = getSavingsBalance(memberId)
  return Math.floor(savingsBalance / shareValue)
}

// Get Loan Balance
function getLoanBalance(loanId: string): number {
  const disbursed = SUM(transactions WHERE type='loan_disbursement' AND loan_id)
  const repaid = SUM(transactions WHERE type='loan_repayment' AND loan_id)
  return disbursed - repaid
}
```

---

## 4. Member Registration

### 4.1 Transactional Registration
Registration is atomic - all or nothing:

```typescript
async function registerMember(data, userId) {
  return await supabase.transaction(async (client) => {
    // 1. Create Member
    const member = await createMember(client, data)
    
    // 2. Create Account Workspaces (5 accounts)
    await createAccounts(client, member.id, ['savings', 'shares', 'contributions', 'welfare', 'fines'])
    
    // 3. Create Compliance Records
    await createComplianceRecords(client, member.id)
    
    // 4. Log Audit
    await createAuditLog(client, {
      action: 'members.create',
      record_id: member.id,
      after_value: member
    })
    
    return member
  })
}
```

### 4.2 Auto-Created Workspaces
On registration, system automatically creates:
- [x] Member Profile
- [x] Member Account (savings)
- [x] Shares Account (derived from savings)
- [x] Contributions Account
- [x] Welfare Account
- [x] Fines Account
- [x] Documents Workspace
- [x] Compliance Record
- [x] Transaction Ledger

---

## 5. Business Logic Rules

### 5.1 Shares Calculation
```
Shares = Total Savings ÷ Share Value
```
- Share Value from Settings (e.g., 100 KES)
- Automatically recalculated on every savings change
- Never manually editable

### 5.2 Loan Eligibility
```
Max Loan = Savings × Loan Percentage
```
- Loan Percentage from Settings (e.g., 75%)
- Recalculated whenever savings change
- Never exceeds configured maximum

### 5.3 Fine Status
```
outstanding = SUM(all fines) - SUM(all payments)
```
- Fines are immutable records
- Payment creates new transaction, doesn't edit fine
- Supports partial payments

### 5.4 Settings-Driven Rules
All business rules come from Settings table:
| Key | Purpose |
|-----|---------|
| shares.share_value | Share calculation divisor |
| loan.max_percentage | Max loan as % of savings |
| loan.max_amount | Absolute maximum loan |
| fees.registration | Registration fee amount |
| fees.annual | Annual membership fee |
| organization.currency | Currency code |
| organization.name | Organization name |

---

## 6. Audit Trail

### 6.1 Immutable Logging
Every important action creates an audit record:

```typescript
interface AuditLog {
  id: string
  user_id: string
  action: string  // e.g., "transactions.create", "members.update"
  record_id: string
  before_value: object | null
  after_value: object | null
  reason: string | null
  ip_address: string
  created_at: timestamp
}
```

### 6.2 Audited Actions
- Member registration
- Member status changes
- All financial transactions
- Transaction reversals
- Settings changes
- Document uploads/verifications
- Compliance updates

---

## 7. Transaction Reversal

### 7.1 Principle
**Never delete financial records. Always reverse.**

### 7.2 Reversal Flow
```
Original Transaction (intact)
↓
Create Reversal Transaction (negative of original)
↓
Mark Original as reversed
↓
Recalculate all derived balances
↓
Update audit trail
↓
Statements reflect both entries
```

### 7.3 Reversal Reference
- Reversal transaction references original
- Original marked with `reversed=true`
- Reversal has `reversal_reason`
- Both visible in statements

---

## 8. Member Account Workspace

### 8.1 Single View
The Member Account Workspace displays everything about a member:

- Personal Information
- Contacts & Next of Kin
- Membership Status
- Financial Summary (derived)
  - Savings Balance
  - Shares Balance
  - Loan Balance
  - Contribution Balance
  - Fine Balance
  - Welfare Balance
- Documents
- Compliance Status
- Transaction History
- Statements

### 8.2 Actions Available
All from one workspace:
- Post Savings Deposit/Withdrawal
- Post Contribution
- Issue Fine
- Process Fine Payment
- Apply for Loan
- Process Loan Repayment
- View Statements
- Upload Documents
- Update Compliance

---

## 9. Dashboard

### 9.1 Live Calculations
Dashboard NEVER stores totals. Always calculates:

```typescript
async function getDashboardStats() {
  const [
    totalMembers = await count(members),
    activeMembers = await count(members WHERE status='active'),
    totalSavings = await sum(transactions WHERE type='savings_deposit'),
    totalWithdrawals = await sum(transactions WHERE type='savings_withdrawal'),
    totalLoansDisbursed = await sum(transactions WHERE type='loan_disbursement'),
    totalLoanRepayments = await sum(transactions WHERE type='loan_repayment'),
    totalFinesIssued = await sum(fines.amount),
    totalFinePayments = await sum(transactions WHERE type='fine_payment'),
    recentTransactions = await select(transactions ORDER BY posted_at DESC LIMIT 20),
    recentMembers = await select(members ORDER BY created_at DESC LIMIT 10)
  ] = await Promise.all([...])
  
  return {
    total_members: totalMembers,
    active_members: activeMembers,
    total_savings: totalSavings - totalWithdrawals,
    total_loans_outstanding: totalLoansDisbursed - totalLoanRepayments,
    total_fines_pending: totalFinesIssued - totalFinePayments,
    recent_activity: [...recentTransactions, ...recentMembers].sortByDate()
  }
}
```

---

## 10. API Design

### 10.1 Transaction API
```typescript
// POST /api/transactions
{
  member_id: string
  account_type: 'savings' | 'contributions' | 'welfare' | 'fines'
  transaction_type: TransactionType
  amount: number
  description?: string
  reference_number?: string
  metadata?: object
}

// Response
{
  success: true
  data: {
    transaction: Transaction
    balances: {
      savings: number (calculated)
      shares: number (calculated)
      contributions: number (calculated)
      welfare: number (calculated)
    }
    audit_id: string
  }
}
```

### 10.2 Member API
```typescript
// POST /api/members (Registration)
{
  first_name: string
  last_name: string
  email?: string
  phone: string
  id_number?: string
  // ... other fields
}

// GET /api/members/[id]
{
  member: Member
  accounts: Account[]
  balances: {
    savings: number (calculated)
    shares: number (calculated)
    fines: number (calculated)
  }
  recent_transactions: Transaction[]
  documents: Document[]
  compliance: ComplianceRecord[]
}

// GET /api/members/[id]/statements
{
  period: { start: date, end: date }
  savings: Transaction[]
  contributions: Transaction[]
  fines: Transaction[]
  totals: CalculatedBalances
}
```

---

## 11. Deployment Configuration

### 11.1 Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
```

### 11.2 Required Settings (Seed Data)
```sql
INSERT INTO settings (key, value, category) VALUES
('shares.share_value', '100', 'financial'),
('loan.max_percentage', '75', 'loan'),
('loan.max_period_months', '12', 'loan'),
('fees.registration', '500', 'fees'),
('fees.annual', '2000', 'fees'),
('organization.name', 'YUNITE CBO', 'organization'),
('organization.currency', 'KES', 'organization');
```

---

## 12. Success Criteria

- [x] All balances calculated from transaction ledger
- [x] No duplicate balance storage
- [x] Transaction engine handles all financial operations
- [x] Member registration creates complete workspace atomically
- [x] Shares auto-derived from savings formula
- [x] Loan eligibility calculated from settings
- [x] Audit trail on all important actions
- [x] Dashboard calculates live, never stores
- [x] All business rules from Settings
- [x] All financial operations reversible
- [x] Member workspace shows complete picture
- [x] Build passes without errors

---

## 13. Release 1 Workspaces

### 13.1 Dashboard
- Live organization overview
- Real-time calculations from Supabase
- Recent activity feed
- Alerts for pending items
- Quick action shortcuts

### 13.2 Member Lookup
- Read-only member verification
- Search by member number or phone
- Complete member workspace view
- Financial summary
- Transaction history
- Loan and fine records
- Document and compliance status

### 13.3 Member Management
- Member registration
- Search and filter
- Status management
- Member workspace access

### 13.4 Transactions
- Fast member search
- All transaction types
- Transaction history
- Real-time balance updates

### 13.5 Loans
- Loan applications
- Approval workflow
- Disbursement tracking
- Repayment processing

### 13.6 Fines
- Fine issuance
- Fine types
- Payment processing
- Outstanding tracking

### 13.7 Contributions
- Monthly contributions
- Special contributions
- Development contributions
- History tracking

### 13.8 Audit Logs
- Complete action history
- Filter by action type
- Detailed change tracking
- Compliance documentation

### 13.9 Settings
- Organization configuration
- Financial rules
- Membership policies
- Business rules management
