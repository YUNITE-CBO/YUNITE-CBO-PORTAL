# YUNITE Enterprise Operating System - Developer Instructions

## System Overview

YUNITE is a comprehensive enterprise portal for managing CBO (Community-Based Organization) operations, including member management, financial transactions, loans, notifications, and more.

---

## Current System Status: ✅ INFRASTRUCTURE COMPLETE

### Last Updated: 2026-08-05

---

## 1. Database Infrastructure

### 1.1 Database Provider
- **Supabase** (PostgreSQL)
- **Project Ref**: `sprlwlxjhhmazxpflhnb`
- **Region**: US East (AWS)

### 1.2 Database Connection
```env
DATABASE_URL="postgresql://postgres.sprlwlxjhhmazxpflhnb:[REDACTED-DB-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.sprlwlxjhhmazxpflhnb:[REDACTED-DB-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
```

### 1.3 Database Tables (32 Total)

#### Core Business Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | System users & authentication | id, email, password_hash, role, is_active |
| `members` | Organization members | id, member_number, first_name, last_name, email, phone, status |
| `accounts` | Member financial accounts | id, member_id, account_type, balance |
| `transactions` | Financial transactions | id, transaction_ref, member_id, amount, transaction_type |
| `loans` | Loan management | id, loan_number, member_id, principal_amount, status |
| `fines` | Fine tracking | id, member_id, amount, reason, status |
| `documents` | Document storage | id, member_id, document_type, file_path |

#### Settings & Compliance
| Table | Purpose |
|-------|---------|
| `settings` | System configuration |
| `compliance_records` | Regulatory compliance records |
| `audit_logs` | System audit trail |

#### Meetings & Reports
| Table | Purpose |
|-------|---------|
| `meetings` | Meeting management |
| `meeting_attendance` | Meeting attendance tracking |
| `reports` | AI-generated reports |

#### Notification System
| Table | Purpose |
|-------|---------|
| `notifications` | User notifications |
| `notification_templates` | Notification templates |
| `notification_preferences` | User notification preferences |
| `notification_channels` | Available channels (email, SMS, push) |
| `notification_categories` | Notification categories |
| `notification_schedules` | Scheduled notifications |
| `notification_delivery_history` | Delivery tracking |
| `notification_statements` | Notification statements |
| `notification_event_logs` | Event logging |

#### Auth & Security
| Table | Purpose |
|-------|---------|
| `user_sessions` | Session management |
| `login_activity` | Authentication event logging |
| `user_management_audit` | Admin action audit trail |
| `roles` | User roles (super_admin, admin, staff, viewer) |
| `permissions` | Role-based permissions |

#### Additional Tables
| Table | Purpose |
|-------|---------|
| `organizations` | Organization profiles |
| `campaigns` | Marketing campaigns |
| `email_queue` | Queued emails |
| `archives` | Data archives |
| `reset_reports` | Database reset reports |

### 1.4 Users Table Schema
```sql
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'staff',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  avatar_url TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  date_joined TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT false
)
```

### 1.5 Default Admin Credentials
```env
Email: info.yunite.ke@gmail.com
Password: [REDACTED 2026-08-26 — the value previously written here was a live
credential committed to git; it MUST be rotated. The current password is stored
only in the operators' password manager / Render env, never in the repo.]
Role: super_admin (full access)
```

---

## 2. Storage Infrastructure

### 2.1 Storage Provider
- **Supabase Storage** (S3-compatible)

### 2.2 Storage Buckets (12 Total)

#### Private Buckets (Authentication Required)
| Bucket | Purpose | File Size Limit |
|--------|---------|-----------------|
| `organizations` | Organization files | 10 MB |
| `members` | Member documents | 10 MB |
| `documents` | General documents | 10 MB |
| `loans` | Loan documents | 10 MB |
| `projects` | Project files | 10 MB |
| `meetings` | Meeting materials | 10 MB |
| `reports` | Generated reports | 10 MB |
| `receipts` | Transaction receipts | 10 MB |
| `attachments` | Email attachments | 10 MB |

#### Public Buckets (Direct Access)
| Bucket | Purpose | Allowed Types |
|--------|---------|---------------|
| `avatars` | User avatars | Images only |
| `member-photos` | Member photos | Images only |
| `organization-logos` | Organization logos | Images only |

---

## 3. Authentication System

### 3.1 Auth Provider
- Custom JWT-based authentication (not Supabase Auth)
- JWT Secret stored in environment variables

### 3.2 Auth Service
- Location: `src/lib/services/auth.service.ts`
- Features:
  - Email/password login
  - JWT token generation
  - Session management
  - Login activity logging
  - Account lockout (5 failed attempts)
  - Password change tracking

### 3.3 API Routes
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/session` | GET | Get current session |
| `/api/auth/profile` | GET/PUT | Get/update profile |

---

## 4. API Endpoints

### 4.1 Auth APIs
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get session
- `GET /api/auth/profile` - Get profile
- `PUT /api/auth/profile` - Update profile

### 4.2 Member APIs
- `GET /api/members` - List members
- `POST /api/members` - Create member
- `GET /api/members/[id]` - Get member
- `PUT /api/members/[id]` - Update member
- `DELETE /api/members/[id]` - Delete member

### 4.3 Transaction APIs
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `GET /api/transactions/[id]` - Get transaction
- `POST /api/transactions/[id]/reverse` - Reverse transaction

### 4.4 Loan APIs
- `GET /api/loans` - List loans
- `POST /api/loans` - Create loan
- `GET /api/loans/[id]` - Get loan
- `PUT /api/loans/[id]` - Update loan

### 4.5 Admin APIs
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Delete user
- `GET /api/admin/login-activity` - Login activity

### 4.6 Settings APIs
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings
- `POST /api/settings/database-reset` - Reset database

### 4.7 Notification APIs
- `GET /api/notifications` - List notifications
- `POST /api/notifications` - Create notification
- `PUT /api/notifications/[id]/read` - Mark as read

---

## 5. Frontend Pages

### 5.1 Public Pages
- `/login` - Login page
- `/` - Landing page

### 5.2 Protected Pages (Dashboard)
| Page | Path | Access |
|------|------|--------|
| Dashboard | `/dashboard` | All authenticated |
| Member Lookup | `/dashboard/lookup` | All authenticated |
| Members | `/dashboard/members` | All authenticated |
| Transactions | `/dashboard/transactions` | All authenticated |
| Loans | `/dashboard/loans` | All authenticated |
| Fines | `/dashboard/fines` | All authenticated |
| Contributions | `/dashboard/contributions` | All authenticated |
| Notifications | `/dashboard/notifications` | All authenticated |
| Audit Logs | `/dashboard/audit-logs` | All authenticated |
| Settings | `/dashboard/settings` | Admin+ |
| User Management | `/dashboard/admin/users` | Super Admin |

---

## 6. Environment Variables

### 6.1 Required Variables
```env
# Database
DATABASE_URL=
DIRECT_URL=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Auth
JWT_SECRET=

# Redis
REDIS_URL=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### 6.2 Optional Variables
```env
# Supabase Personal Access Token (for migrations)
SUPABASE_ACCESS_TOKEN=
```

---

## 7. Migrations

### 7.1 Migration Files
Located in `supabase/migrations/`:
- `001_initial_schema.sql` - Core tables
- `002_members.sql` - Member management
- `003_loans_system.sql` - Loan system
- `004_reset_tables.sql` - Reset functionality
- `005_notification_engine.sql` - Notification system
- `006_auth_system.sql` - Authentication system

### 7.2 Running Migrations
```bash
# Using Supabase CLI
npx supabase db push

# Or manually via Supabase SQL Editor
# Copy SQL from migration files and execute
```

### 7.3 Database Access Token
For programmatic migration access, get a Personal Access Token from:
https://supabase.com/dashboard/account/tokens

Then add to your local `.env`:
```env
SUPABASE_ACCESS_TOKEN=sbp_your_token_here
```

---

## 8. Redis

### 8.1 Provider
- **Redis Labs** (Upstash)
- Used for caching and real-time features

### 8.2 Connection
```env
REDIS_URL=redis://default:[REDACTED-REDIS-PASSWORD]@playground-carob-talk-92024.db.redis.io:19389
```

---

## 9. Email System

### 9.1 Provider
- SMTP (Gmail)

### 9.2 Configuration
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info.yunite.ke@gmail.com
SMTP_PASS= # App password
```

---

## 10. Project Structure

```
YUNITE-CBO-PORTAL/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/              # API routes
│   │   ├── dashboard/        # Dashboard pages
│   │   ├── login/           # Login page
│   │   └── layout.tsx       # Root layout
│   ├── components/           # React components
│   ├── lib/                  # Utilities & services
│   │   ├── services/         # Business logic
│   │   ├── supabase/        # Supabase clients
│   │   └── utils/           # Helper functions
│   └── types/               # TypeScript types
├── supabase/
│   └── migrations/          # Database migrations
├── docs/                    # Documentation
└── public/                 # Static assets
```

---

## 11. Next Steps / Phase 2

### 11.1 Pending Features
- [ ] Member registration workflow
- [ ] Loan application & approval workflow
- [ ] Contribution tracking
- [ ] Fine management
- [ ] Report generation
- [ ] Meeting management
- [ ] Email/SMS notifications
- [ ] Mobile responsiveness improvements
- [ ] Real-time updates (WebSocket)

### 11.2 Database Migrations Needed
- Add foreign key constraints (if not present)
- Add database triggers for audit logs
- Create database functions for complex operations

### 11.3 Testing Needed
- [ ] Login/logout flow
- [ ] CRUD operations for all entities
- [ ] Role-based access control
- [ ] File upload to storage
- [ ] Email notifications
- [ ] API rate limiting

---

## 12. Support

### 12.1 Documentation
- This file: `docs/DEVELOPER_INSTRUCTIONS.md`
- API types: `src/types/api.ts`

### 12.2 Key Files
- Auth Service: `src/lib/services/auth.service.ts`
- Supabase Client: `src/lib/supabase/server.ts`
- Login Page: `src/app/login/page.tsx`
- Dashboard Layout: `src/app/dashboard/layout.tsx`

---

## 13. Deployment

### 13.1 Build
```bash
npm run build
```

### 13.2 Start
```bash
npm run start
```

### 13.3 Development
```bash
npm run dev
```

---

*Document generated: 2026-08-05*
