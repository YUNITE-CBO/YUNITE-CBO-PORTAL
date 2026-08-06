# YUNITE Enterprise Operating System - Release 1.1.0

## Architecture Specification

### Core Principle
**Every piece of data has one owner, one source of truth, and one place where it is maintained.**

---

## Release 1.1.0 Summary
- Added comprehensive authentication system with login/logout
- Added user profile management with role-based access
- Added banking-grade login UI with security features
- Added login/logout notifications for users and super admins
- Added Super Admin user management capabilities
- Added account lockout after failed login attempts
- Added session tracking and management
- Added audit logging for all authentication events
- Added password strength validation
- Improved dashboard with user info in navigation

---

## Authentication System (Release 1.1.0)

### Overview
The authentication system provides enterprise-grade security with the following features:

1. **Secure Login**
   - JWT-based authentication with 24-hour token expiry
   - Password hashing using bcrypt (12 rounds)
   - Account lockout after 5 failed attempts (30-minute lockout)
   - IP address and device tracking
   - Login notifications sent to user

2. **User Roles**
   - **Super Admin**: Full system access, user management, cannot be modified
   - **Admin**: Administrative access, cannot modify super admin
   - **Staff**: Standard operational access
   - **Viewer**: Read-only access

3. **Profile Management**
   - Users can update: full name, phone, address, emergency contact
   - Users CANNOT update: email, role (locked fields)
   - Password change with current password verification

4. **Notifications**
   - Login notification sent to user via email and in-app
   - Logout notification sent to user
   - Super Admin receives notifications for all user login/logout events
   - Notifications include: user name, time, device info, IP address

5. **Security Features**
   - Session tracking with IP and device info
   - Failed login attempt tracking
   - Account lockout mechanism
   - Password strength validation
   - Audit logging for all auth events
   - Session invalidation on password change

### Database Schema Changes

```
users (enhanced)
├── avatar_url
├── address
├── emergency_contact_name
├── emergency_contact_phone
├── date_joined
├── failed_login_attempts
├── locked_until
├── password_changed_at
├── must_change_password

user_sessions
├── id (UUID, PK)
├── user_id (FK → users)
├── session_token
├── ip_address
├── user_agent
├── device_info (JSONB)
├── location_info (JSONB)
├── is_active
├── created_at
├── last_activity_at
├── expires_at
├── terminated_at
├── termination_reason

login_activity
├── id (UUID, PK)
├── user_id (FK → users)
├── email
├── event_type
├── ip_address
├── user_agent
├── device_info (JSONB)
├── metadata (JSONB)
├── success
├── failure_reason
├── created_at

notification_preferences
├── id (UUID, PK)
├── user_id (FK → users)
├── notify_on_login
├── notify_on_logout
├── notify_on_password_change
├── notify_on_profile_update
├── email_notifications
├── in_app_notifications

user_management_audit
├── id (UUID, PK)
├── admin_user_id (FK → users)
├── target_user_id (FK → users)
├── action
├── old_values (JSONB)
├── new_values (JSONB)
├── reason
├── ip_address
├── created_at
```

### API Endpoints

**Authentication APIs:**
- `POST /api/auth/login` - User login with notifications
- `POST /api/auth/logout` - User logout with notifications
- `GET /api/auth/session` - Get current user session
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/password` - Change password
- `GET /api/auth/token` - Get raw JWT token

**Admin APIs (Super Admin only):**
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `GET /api/admin/users/[id]` - Get user details
- `PUT /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Deactivate user
- `GET /api/admin/login-activity` - View login activity

### Frontend Pages

**Login Page** (`/login`)
- Modern banking-grade UI with branding panel
- Show/hide password toggle
- Error handling with attempts remaining
- Security badges (SSL, Encrypted)

**Profile Page** (`/profile`)
- User info display with avatar
- Editable fields: name, phone, address, emergency contact
- Locked fields: email, role (with explanation)
- Password change modal
- Logout button

**User Management** (`/dashboard/admin/users`)
- Super Admin only access
- User list with search and filters
- Create/Edit/Deactivate users
- Role assignment
- Password reset capability

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

---

## 14. Release 1.2.0 - Phase 4: Enterprise Configuration & Document Management

### 14.1 Configuration Management Framework

**Core Principle**: Every configuration page always loads values from the database. No placeholder text when values exist.

#### Key Features:
- **Database-Driven Configuration**: All settings are stored in PostgreSQL and loaded dynamically
- **Configuration Status Indicators**: Each section shows configured/partial/unconfigured status
- **Change History Tracking**: Full audit trail of all configuration changes
- **Category-Based Organization**: Settings grouped by functional area (Organization, Financial, Security, etc.)
- **Value Validation**: Settings have data types (string, number, boolean, password, json)
- **Help Text**: Each setting includes descriptive help text
- **Change Reason**: Optional reason field for tracking configuration changes

#### Configuration Categories:
| Category | Description | Key Settings |
|----------|-------------|--------------|
| Organization | Organization profile and branding | name, registration_number, email, phone, address, logo |
| Financial | Financial rules and fees | share_value, registration_fee, annual_fee |
| Loans | Loan products and terms | interest_rate, max_amount, max_period_months |
| Security | Security settings | max_login_attempts, lockout_duration, session_hours |
| SMTP | Email server configuration | host, port, username, password, from_email |
| Notifications | Notification preferences | channels, templates |
| Welfare | Welfare scheme settings | monthly_amount |
| Contributions | Contribution settings | monthly_default |
| Compliance | Document requirements | required_documents |

#### API Endpoints:
- `GET /api/configuration` - Get all settings by category
- `GET /api/configuration?category=<code>` - Get settings for specific category
- `GET /api/configuration?status=true` - Get configuration status summary
- `GET /api/configuration?history=true` - Get configuration change history
- `PUT /api/configuration` - Update settings (single or batch)

#### Database Tables:
- `configuration_categories` - Category definitions with icons and colors
- `settings_groups` - Logical groupings within categories
- `configuration_history` - Complete change history with before/after values

### 14.2 Enterprise Document Management System

**Core Principle**: Centralized document engine available across all modules.

#### Key Features:
- **Multi-Module Support**: Documents for members, loans, meetings, accounting, etc.
- **Supabase Storage Integration**: Files stored in Supabase Storage buckets
- **File Versioning**: Track document versions without losing history
- **Configurable Categories**: Organizations define their own document requirements
- **Upload Methods**: Drag-and-drop, file selection, bulk uploads
- **Supported Formats**: Images, PDF, Microsoft Office, spreadsheets, text

#### Document Categories (Members):
| Category | Code | Required |
|----------|------|----------|
| National ID | member_national_id | Yes |
| Passport Photo | member_passport_photo | Yes |
| KRA PIN | member_kra_pin | Yes |
| Proof of Residence | member_proof_residence | Yes |
| Application Form | member_application_form | Yes |
| Member Agreement | member_agreement | Yes |
| Consent Form | member_consent_form | No |
| Passport | member_passport | No |
| Certificate | member_certificate | No |
| Tax Document | member_tax_document | No |

#### Compliance Workflow:
1. **Documentation Stage**: Member uploads required documents
2. **Review Stage**: Admin reviews submitted documents
3. **Approval Stage**: Admin approves individual requirements
4. **Completion**: All requirements met, member can be activated

#### API Endpoints:
- `GET /api/documents` - Get documents for entity
- `POST /api/documents` - Upload document
- `PUT /api/documents/[id]` - Verify/archive document
- `DELETE /api/documents/[id]` - Delete document
- `GET /api/compliance` - Get member compliance status
- `POST /api/compliance` - Submit/review compliance
- `GET /api/document-categories` - Get document categories
- `POST /api/document-categories` - Create document category

#### Database Tables:
- `documents` - Enhanced with versioning, metadata, storage info
- `document_categories` - Configurable categories per module
- `member_compliance` - Per-member compliance tracking
- `member_approval_workflow` - Formal approval workflow
- `file_uploads` - Cross-module file tracking

### 14.3 Migration

Migration file: `supabase/migrations/007_document_management_system.sql`

Includes:
- Enhanced `documents` table with versioning and metadata
- `document_categories` table with configurable requirements
- `configuration_categories` table for organized settings
- `settings_groups` for logical groupings
- `configuration_history` for change tracking
- `member_compliance` for compliance tracking
- `member_approval_workflow` for formal approval
- `file_uploads` for cross-module file tracking
- RLS policies for all new tables
- Database triggers for auto-compliance initialization

### 14.4 Frontend Pages

#### Enhanced Settings Page
- `/dashboard/settings` - New database-driven settings interface
- Overview with configuration status cards
- Progress bar showing configuration completeness
- Category cards with status indicators
- Individual setting forms with current DB values
- Change reason input for tracking
- Configuration history view

#### Member Documents Page
- `/dashboard/members/documents` - Document management hub
- Member selector
- Compliance score and status
- Document requirements checklist
- Document upload interface
- Document preview and verification

### 14.5 Services

#### ConfigurationService
- `getAllByCategory()` - Get all settings grouped by category
- `getByCategory(code)` - Get settings for specific category
- `updateSetting(key, value, ...)` - Update with history tracking
- `updateMany(updates, ...)` - Batch update
- `getHistory(options)` - Get configuration change history
- `getStatusSummary()` - Get configuration completeness

#### DocumentService
- `uploadFile(file, options)` - Upload to Supabase Storage
- `getEntityDocuments(module, type, id)` - Get documents for entity
- `getMemberComplianceStatus(memberId)` - Get compliance status
- `verifyDocument(id, reviewer)` - Verify document
- `reviewCompliance(...)` - Approve/reject compliance
- `submitComplianceDocument(...)` - Submit for review

---

## 15. Enterprise Document & Media Service (Phase 5)

### 15.1 Architecture Overview

The **Enterprise Document & Media Service** is a centralized platform service that serves as the single source of truth for every uploaded file within the YUNITE Enterprise Operating System.

**Core Principles:**
1. **Single Source of Truth**: All document operations flow through one centralized service
2. **Module-Specific Behavior**: Each module maintains its own business rules while using the same underlying engine
3. **Full Integration**: Documents integrate with notifications, audit logs, workflows, and all platform modules
4. **Enterprise-Grade**: Versioning, expiration, compliance tracking, and comprehensive search

### 15.2 Module Types Supported

| Module | Entity Types | Document Categories |
|--------|-------------|-------------------|
| members | member, compliance_record | KYC, photos, certificates |
| users | user, session | Profile photos, ID documents |
| organization | organization, branch | Certificates, branding |
| loans | loan, guarantor, collateral | Agreements, collateral docs |
| savings | savings_account | Certificates, statements |
| contributions | campaign, payment | Receipts, certificates |
| welfare | case, claim | Medical docs, evidence |
| donations | donation, campaign | Receipts, agreements |
| investments | investment, return | Proposals, contracts |
| projects | project, milestone | Proposals, reports |
| meetings | meeting, agenda | Minutes, resolutions |
| procurement | purchase, order | POs, invoices, contracts |
| inventory | item, transfer | Photos, appraisals |
| assets | asset, maintenance | Titles, insurance |
| events | event, attendee | Posters, reports |
| reports | report, statement | Generated reports |
| ai_center | analysis, model | AI outputs |
| notifications | notification | Attachments |
| settings | configuration | Backups, policies |
| financial | transaction | Receipts, statements |

### 15.3 Document Lifecycle

```
DRAFT → PENDING → UNDER_REVIEW → APPROVED/REJECTED
                                    ↓
                              EXPIRED ←────────── ARCHIVED
```

### 14.4 Document Categories by Module

Each module has configurable document categories with:
- Required/optional flags
- MIME type restrictions
- File size limits
- Approval workflows
- Retention policies

### 15.5 Core Services

#### EnterpriseDocumentService
```typescript
// Central service for all document operations
const service = enterpriseDocumentService;

// Upload document
const result = await service.upload({
  module: 'members',
  entityType: 'member',
  entityId: memberId,
  categoryCode: 'member_national_id',
  file: fileInput.files[0],
  fileName: 'national_id.pdf',
  userId: currentUser.id,
});

// Search documents
const results = await service.search({
  module: 'members',
  entityId: memberId,
  query: 'birth certificate',
  status: 'approved',
});

// Workflow operations
await service.approve(documentId, userId, notes);
await service.reject(documentId, userId, reason);
await service.archive(documentId, userId);

// Versioning
const versions = await service.getVersionHistory(documentId);
const result = await service.replace(documentId, newFile, newFileName, userId);
```

#### DocumentSearchService
```typescript
// Full-text search
const results = await searchService.search({
  query: 'loan agreement',
  module: 'loans',
  status: 'approved',
  page: 1,
  pageSize: 20,
});

// Faceted search
const facets = await searchService.getFacets({});

// Statistics
const stats = await searchService.getStatistics();
```

### 15.6 Module Handlers

Module-specific handlers provide customized behaviors:

| Handler | Special Behaviors |
|---------|------------------|
| MemberDocumentHandler | KYC compliance, profile photos, compliance score |
| UserDocumentHandler | Avatar updates, profile photos |
| LoanDocumentHandler | Required documents, guarantor verification |
| OrganizationDocumentHandler | Branding updates, certificate linking |
| FinancialDocumentHandler | Retention policies, transaction linking |
| MeetingDocumentHandler | Minutes versioning, agenda linking |
| WelfareDocumentHandler | Confidentiality handling, case updates |
| ProjectDocumentHandler | Proposal/contract linking |
| ReportDocumentHandler | Auto-approval, audit trail |

### 15.7 Database Tables

**documents** - Core document storage
- id, document_ref (unique reference)
- module, entity_type, entity_id (classification)
- category_code (configurable categories)
- storage_bucket, storage_path (Supabase Storage)
- file_name, mime_type, file_size, checksum
- status, is_verified, verification_notes
- version, parent_document_id (versioning)
- expiry_date, is_expired, reminder_sent
- visibility (public/authenticated/admin/owner)
- metadata (flexible JSON)

**document_categories** - Configurable categories
- code, name, module, is_required
- allowed_mime_types, max_file_size_mb
- retention_days, workflow_required

**document_events** - Event tracking
- event_type, document_id, actor_id
- timestamp, previous_status, new_status

**document_access_logs** - Access auditing
- document_id, user_id, access_type
- timestamp, success, failure_reason

### 15.8 API Endpoints

```
GET  /api/documents                     - Search/list documents
GET  /api/documents?action=search      - Full-text search
GET  /api/documents?action=facets      - Search facets
GET  /api/documents?action=stats        - Document statistics
GET  /api/documents?action=expiring     - Expiring documents
GET  /api/documents?module=X&entityId=Y - Get for entity
GET  /api/documents?id=X                - Get by ID
POST /api/documents                     - Upload document

GET  /api/documents/[id]                - Get document details
GET  /api/documents/[id]?action=download - Get download URL
PUT  /api/documents/[id]                - Update (verify, approve, etc.)
DELETE /api/documents/[id]              - Delete document
```

### 15.9 Reusable Components

```tsx
// Use DocumentManager across all modules
import { DocumentManager } from '@/components/documents';

// Basic usage
<DocumentManager
  module="members"
  entityId={member.id}
  entityType="member"
  readOnly={false}
  showComplianceStatus={true}
/>

// Compact view
<DocumentManager
  module="loans"
  entityId={loan.id}
  compact={true}
/>
```

### 15.10 Event Integration

Document operations trigger events for other services:

| Event | Trigger | Response |
|-------|---------|----------|
| document.uploaded | New upload | Notification to admin |
| document.approved | Approval | Update compliance score |
| document.rejected | Rejection | Notify uploader |
| document.expiring | 30 days before expiry | Send reminder |
| document.expired | Past expiry date | Update status, notify |

### 15.11 Migrations

- `007_document_management_system.sql` - Initial document system
- `008_document_service_integration.sql` - Full integration with all modules

---

## 16. Super Administrator Bootstrap System (Release 1.4.0)

### 16.1 Overview

The Super Administrator Bootstrap System ensures that a Super Administrator account always exists in the database based on environment configuration. This system provides:

1. **Automatic Account Provisioning**: Creates Super Admin on first startup if not exists
2. **Environment-Based Configuration**: Credentials come exclusively from environment variables
3. **Idempotent Operations**: Safe to run multiple times without creating duplicates
4. **Audit Trail**: All bootstrap operations are logged for compliance
5. **Graceful Failure**: Startup fails cleanly with clear error messages if config is missing

### 16.2 Environment Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPER_ADMIN_NAME` | Yes | Full name of the Super Administrator |
| `SUPER_ADMIN_EMAIL` | Yes | Email address for login (must be unique) |
| `SUPER_ADMIN_PASSWORD` | Yes | Secure password (min 8 chars with uppercase, lowercase, number) |
| `SUPER_ADMIN_PHONE` | No | Phone number |
| `SUPER_ADMIN_STATUS` | No | ACTIVE or INACTIVE, defaults to ACTIVE |

### 16.3 Bootstrap Logic

```
STARTUP:
  1. Read SUPER_ADMIN_* from environment
  2. Validate all required variables exist
  3. IF any required variable missing:
     - Log error to bootstrap_logs
     - Continue startup (non-fatal)
  4. Query users table for email = SUPER_ADMIN_EMAIL
  5. IF user not found:
     - Hash password with bcrypt (12 rounds)
     - Create user with role='super_admin', is_active=true
     - Create notification_preferences
     - Log 'created' to bootstrap_logs
  6. IF user found:
     - Validate role is 'super_admin' (correct if not)
     - Validate is_active matches SUPER_ADMIN_STATUS
     - Update name/phone if changed
     - Log 'verified' or 'updated' to bootstrap_logs
```

### 16.4 Database Schema (Migration 013)

**bootstrap_logs** - Tracks all bootstrap operations
```
bootstrap_logs
├── id (UUID, PK)
├── operation_type (ENUM: super_admin_bootstrap, system_initialization, etc.)
├── status (ENUM: success, failed, skipped, warning)
├── action_taken (TEXT)
├── message (TEXT)
├── details (JSONB)
├── duration_ms (INTEGER)
├── environment (TEXT)
├── metadata (JSONB)
├── error_trace (TEXT)
├── created_at (TIMESTAMPTZ)
```

**Enhanced users table fields**
```
users (enhanced with)
├── email_verified (BOOLEAN)
├── email_verified_at (TIMESTAMPTZ)
├── is_system_user (BOOLEAN)
├── is_protected (BOOLEAN)
├── department (TEXT)
├── job_title (TEXT)
├── employee_id (TEXT)
├── password_history (JSONB)
├── suspended_at (TIMESTAMPTZ)
├── suspended_by (UUID REFERENCES users)
├── suspension_reason (TEXT)
├── suspension_expires_at (TIMESTAMPTZ)
├── archived_at (TIMESTAMPTZ)
├── archived_by (UUID REFERENCES users)
├── archive_reason (TEXT)
├── admin_notes (TEXT)
├── total_logins (INTEGER)
├── last_active_at (TIMESTAMPTZ)
├── account_status (COMPUTED: active, inactive, suspended, archived, locked)
```

### 16.5 Services

#### SuperAdminBootstrapService
```typescript
// Main entry point
const result = await superAdminBootstrapService.bootstrap();
// Returns: { success, action, message, userId, timestamp, details }

// Check bootstrap status
const status = await superAdminBootstrapService.getBootstrapStatus();
// Returns: { configured, exists, userId?, lastBootstrap? }
```

#### ApplicationStartupService
```typescript
// Initialize application (runs on startup)
const result = await applicationStartupService.initialize();
// Runs: super_admin_bootstrap, notification_cleanup, database_verification
```

#### UserManagementService
```typescript
// Create user
const result = await userManagementService.createUser(adminId, {
  email: 'user@example.com',
  password: 'SecurePass123',
  fullName: 'John Doe',
  phone: '+254712345678',
  role: 'staff',
  department: 'Finance',
});

// Update user
const result = await userManagementService.updateUser(adminId, userId, {
  fullName: 'Jane Doe',
  department: 'HR',
});

// Deactivate user
const result = await userManagementService.deactivateUser(adminId, userId, {
  reason: 'Employment terminated',
});

// Suspend user
const result = await userManagementService.suspendUser(
  adminId, userId, 'Under investigation', 
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
);

// Reset password
const result = await userManagementService.resetPassword(
  adminId, userId, 'NewSecurePass456', 
  { forceChangeOnLogin: true }
);

// List users with filtering
const { users, total, pagination } = await userManagementService.listUsers({
  query: 'john',
  role: 'staff',
  isActive: true,
  department: 'Finance',
  limit: 20,
  offset: 0,
});

// Get user audit history
const { audits, total } = await userManagementService.getUserAuditHistory(userId);
```

### 16.6 API Endpoints

**Bootstrap API**
```
GET  /api/bootstrap                      - Get bootstrap status
POST /api/bootstrap                      - Trigger bootstrap manually (Super Admin only)
```

**User Management API**
```
GET  /api/users                          - List users with filtering
POST /api/users                          - Create new user (Admin/Super Admin)

GET  /api/users/[id]                     - Get user details
PUT  /api/users/[id]                     - Update user
DELETE /api/users/[id]                   - Deactivate user

GET  /api/users/[id]/actions?action=audit-history  - Get user audit history
POST /api/users/[id]/actions?action=suspend         - Suspend user
POST /api/users/[id]/actions?action=reactivate     - Reactivate user
POST /api/users/[id]/actions?action=reset-password  - Reset password
```

### 16.7 Frontend Features

**User Management Dashboard** (`/dashboard/admin/users`)
- Bootstrap status indicator (shows if Super Admin is configured)
- User list with search, role filter, and status filter
- Create user modal with department/job title fields
- Edit user modal with protected Super Admin notice
- User details modal with full account information
- Audit history modal for each user
- Environment-managed badge for Super Admin accounts

### 16.8 Security Features

1. **Password Strength Validation**
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character

2. **Password History**
   - Tracks last 5 passwords
   - Prevents password reuse

3. **Protected Accounts**
   - Super Admin cannot be modified through UI
   - Super Admin cannot be deactivated
   - Minimum one Super Admin must exist

4. **Audit Logging**
   - All user operations logged with acting admin
   - Old/new values tracked
   - IP address and user agent recorded
   - Reason field for compliance

### 16.9 Migrations

- `013_super_admin_bootstrap.sql` - Bootstrap system with enhanced user fields

### 16.10 Environment Variables for Production

In Render dashboard, configure the following environment variables:

```
SUPER_ADMIN_NAME=Your Name
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123!
SUPER_ADMIN_PHONE=+254712345678
SUPER_ADMIN_STATUS=ACTIVE
```

---

## 17. Enterprise User Management System

### 17.1 Overview

The Enterprise User Management System provides comprehensive identity management for all non-Super Administrator users. Every organizational user is managed entirely through this module without requiring direct database access or environment configuration.

### 17.2 User Lifecycle

```
┌─────────┐    Create     ┌─────────┐    Deactivate   ┌────────────┐
│ Active  │──────────────>│ Pending │────────────────>│ Inactive   │
└─────────┘               └─────────┘                 └────────────┘
     │                        │                             │
     │ Suspend                │ Activate                    │ Reactivate
     v                        v                             v
┌───────────┐          ┌─────────┐                  ┌─────────┐
│ Suspended │─────────>│ Active  │<─────────────────│ Active  │
└───────────┘          └─────────┘                  └─────────┘
```

### 17.3 Role Hierarchy

| Role | Level | Permissions |
|------|-------|------------|
| Super Admin | 100 | Environment-managed, cannot be modified through UI |
| Admin | 75 | Full user management except Super Admin |
| Staff | 50 | Standard operational access |
| Viewer | 25 | Read-only access |

### 17.4 Department Management

Users can be assigned to departments for organizational purposes:

- Finance
- Human Resources
- Operations
- IT
- etc.

### 17.5 Key Features

1. **Comprehensive User Profiles**
   - Contact information
   - Department and job title
   - Employee ID
   - Login statistics
   - Account status

2. **Account Status Management**
   - Active/Inactive toggle
   - Temporary suspension with expiry
   - Automatic unsuspension when expired

3. **Role-Based Access Control**
   - Intuitive role assignment
   - Role hierarchy enforcement
   - Admin privilege restrictions

4. **Security Features**
   - Password reset by admin
   - Forced password change on login
   - Session termination on role/status change
   - Failed login tracking

5. **Audit Trail**
   - Complete change history
   - Acting administrator tracking
   - Reason for changes
   - Immutable records
