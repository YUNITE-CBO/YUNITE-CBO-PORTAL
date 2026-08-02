# YUNITE Enterprise Operating System - API Reference

## Overview

All API endpoints follow a consistent response format:

```json
{
  "success": true|false,
  "data": {...},
  "error": "Error message (on failure)",
  "message": "Success message (optional)"
}
```

All financial endpoints use the Transaction Engine as the single source of truth. Every balance is calculated from the transaction ledger, never stored independently.

---

## Health & Status

### GET /api/health
Health check endpoint to verify system and database connectivity.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00Z",
  "system": "YUNITE Enterprise OS v1.0.1"
}
```

---

## Authentication

### POST /api/auth/login
Authenticate a user and receive a JWT token.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

Sets `auth_token` cookie (HTTP-only, 24h expiry).

---

### POST /api/auth/logout
Clear authentication and logout user.

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## Dashboard

### GET /api/dashboard
Get live dashboard statistics. All values calculated from Supabase in real-time.

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "total_members": 150,
      "active_members": 145,
      "pending_members": 5,
      "total_savings": 2500000,
      "total_shares": 25000,
      "total_contributions": 500000,
      "total_welfare": 100000,
      "total_fines_pending": 25000,
      "total_loans_outstanding": 1500000,
      "total_loan_repayments": 750000
    },
    "recent_activity": [...],
    "alerts": [
      { "type": "warning", "title": "Pending Loans", "message": "3 loan application(s) awaiting approval" }
    ]
  }
}
```

---

## Members

### GET /api/members
Search and list members.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| query | string | Search term (name, member_number, phone) |
| status | string | Filter by status (pending, active, suspended, withdrawn) |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "member_number": "YUN-20240801-0001",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "0712345678",
      "status": "active",
      "registration_date": "2024-01-01"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

### POST /api/members
Register a new member. Automatically creates all required workspaces.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "0712345678",
  "id_number": "12345678",
  "date_of_birth": "1990-01-15",
  "gender": "male",
  "physical_address": "123 Main St, Nairobi",
  "occupation": "Engineer",
  "employer": "Tech Corp",
  "next_of_kin_name": "Jane Doe",
  "next_of_kin_phone": "0723456789",
  "next_of_kin_relationship": "Spouse"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Member registered successfully",
  "data": {
    "member": { ... },
    "accounts": [
      { "account_type": "savings", "status": "active" },
      { "account_type": "shares", "status": "active" },
      { "account_type": "contributions", "status": "active" },
      { "account_type": "welfare", "status": "active" },
      { "account_type": "fines", "status": "active" }
    ]
  }
}
```

On registration, the system automatically creates:
- Member profile
- 5 account workspaces (savings, shares, contributions, welfare, fines)
- Compliance records

---

### GET /api/members/[id]
Get complete member workspace with calculated balances.

**Response:**
```json
{
  "success": true,
  "data": {
    "member": { ... },
    "accounts": [...],
    "transactions": [...],
    "loans": [...],
    "fines": [...],
    "balances": {
      "savings": 50000,
      "shares": 500,
      "contributions": 12000,
      "welfare": 5000,
      "fines": 500,
      "loans": 25000
    }
  }
}
```

Balances are calculated from the transaction ledger using the Transaction Engine.

---

### GET /api/members/lookup
Read-only member lookup for verification.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| member_number | string | Exact member number |
| phone | string | Registered phone number |

**Response:**
```json
{
  "success": true,
  "data": {
    "member": { ... },
    "balances": { ... },
    "transactions": [...],
    "loans": [...],
    "fines": [...],
    "documents": [...],
    "compliance": [...]
  }
}
```

---

## Transactions

### GET /api/transactions
Get transaction history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| member_id | UUID | Filter by member |
| account_type | string | Filter by account (savings, contributions, etc.) |
| start_date | ISO date | Start of date range |
| end_date | ISO date | End of date range |
| page | number | Page number |
| limit | number | Items per page |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transaction_ref": "TXN-20240801-SDP-abc123",
      "member_id": "uuid",
      "transaction_type": "savings_deposit",
      "amount": 5000,
      "balance_before": 45000,
      "balance_after": 50000,
      "description": "Monthly deposit",
      "posted_at": "2024-08-01T10:30:00Z",
      "reversed": false
    }
  ],
  "pagination": { ... }
}
```

---

### POST /api/transactions
Execute a financial transaction through the Transaction Engine.

**Request Body:**
```json
{
  "member_id": "uuid",
  "account_type": "savings",
  "transaction_type": "deposit",
  "amount": 5000,
  "description": "Monthly savings deposit",
  "reference_number": "MPESA-REF123"
}
```

**Transaction Type Mapping:**
| Client Type | Internal Type |
|-------------|--------------|
| deposit | savings_deposit |
| withdrawal | savings_withdrawal |
| contribution | contribution_monthly |
| fine | fine_payment |
| loan_repayment | loan_repayment |

**Response:**
```json
{
  "success": true,
  "message": "Transaction completed successfully",
  "data": {
    "transaction": { ... },
    "balances": {
      "savings": 55000,
      "shares": 550,
      "contributions": 12000,
      "welfare": 5000,
      "fines": 500,
      "loans": 25000
    }
  }
}
```

---

### GET /api/transactions/[id]
Get single transaction details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "transaction_ref": "TXN-20240801-SDP-abc123",
    "member": { "first_name": "John", "last_name": "Doe", "member_number": "YUN-001" },
    "account": { "account_type": "savings" },
    ...
  }
}
```

---

### POST /api/transactions/reverse
Reverse a transaction with audit trail. Original transaction is preserved.

**Request Body:**
```json
{
  "transaction_id": "uuid",
  "reason": "Incorrect amount entered"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction reversed successfully",
  "data": {
    "reversal": { ... },
    "balances": { ... }
  }
}
```

---

## Fines

### GET /api/fines
Get fine records.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| member_id | UUID | Filter by member |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "fine_number": "FINE-20240801-0001",
      "member_id": "uuid",
      "fine_type": "meeting_absence",
      "amount": 500,
      "amount_paid": 0,
      "reason": "Absent from monthly meeting",
      "status": "pending",
      "due_date": "2024-08-15"
    }
  ]
}
```

---

### POST /api/fines
Issue a fine to a member.

**Request Body:**
```json
{
  "member_id": "uuid",
  "fine_type": "meeting_absence",
  "amount": 500,
  "reason": "Absent from monthly meeting",
  "due_date": "2024-08-15"
}
```

**Fine Types:**
- `meeting_absence` - Missed meeting attendance
- `late_payment` - Late loan/fine payment
- `penalty` - General penalty
- `manual` - Manually issued fine

**Response:**
```json
{
  "success": true,
  "message": "Fine issued successfully",
  "data": { ... }
}
```

---

### POST /api/fines/pay
Process fine payment.

**Request Body:**
```json
{
  "fine_id": "uuid",
  "amount": 500
}
```

**Response:**
```json
{
  "success": true,
  "message": "Fine payment processed",
  "data": {
    "payment": { ... },
    "balances": { ... }
  }
}
```

---

## Loans

### GET /api/loans
Get loan records.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| member_id | UUID | Filter by member (optional) |

Without `member_id`, returns pending loans only.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "loan_number": "LOAN-20240801-0001",
      "member_id": "uuid",
      "loan_type": "emergency",
      "principal_amount": 50000,
      "interest_rate": 10,
      "interest_amount": 5000,
      "total_amount": 55000,
      "amount_paid": 0,
      "amount_due": 55000,
      "repayment_period_months": 12,
      "monthly_repayment": 4583.33,
      "status": "pending"
    }
  ]
}
```

---

### POST /api/loans
Apply for a loan.

**Request Body:**
```json
{
  "member_id": "uuid",
  "loan_type": "emergency",
  "principal_amount": 50000,
  "repayment_period_months": 12,
  "purpose": "Home improvement"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Loan application submitted",
  "data": { ... }
}
```

**Loan Eligibility Calculation:**
```
Max Loan = Savings × Loan Percentage (from Settings)
Available Credit = Max Loan - Current Loan Balance
```

---

### GET /api/loans/eligibility/[memberId]
Calculate loan eligibility for a member.

**Response:**
```json
{
  "success": true,
  "data": {
    "savings_balance": 50000,
    "max_percentage": 75,
    "max_loan_amount": 37500,
    "current_loan_balance": 10000,
    "available_credit": 27500
  }
}
```

---

## Contributions

### GET /api/contributions/campaigns
Get contribution campaigns.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "campaign_name": "Annual Welfare Fund 2024",
      "description": "Annual welfare fund for member support",
      "target_amount": 500000,
      "collected_amount": 125000,
      "start_date": "2024-01-01",
      "end_date": "2024-12-31",
      "is_active": true
    }
  ]
}
```

---

### POST /api/contributions/campaigns
Create a new contribution campaign.

**Request Body:**
```json
{
  "campaign_name": "Emergency Relief Fund",
  "description": "Emergency fund for members",
  "target_amount": 200000,
  "start_date": "2024-03-01",
  "end_date": null
}
```

---

## Settings

### GET /api/settings
Get all system settings.

**Response:**
```json
{
  "success": true,
  "data": {
    "shares.share_value": { "value": "100", "description": "Value per share" },
    "loan.max_percentage": { "value": "75", "description": "Max loan as % of savings" },
    "fees.registration": { "value": "500", "description": "Registration fee" },
    ...
  }
}
```

---

### PUT /api/settings
Update settings.

**Request Body:**
```json
{
  "category": "financial",
  "settings": {
    "share_value": "100",
    "registration_fee": "500"
  }
}
```

---

## Audit Logs

### GET /api/audit
Get audit log entries.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 50) |
| action | string | Filter by action pattern |
| record_id | UUID | Filter by record ID |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "transactions.savings_deposit",
      "record_id": "transaction-uuid",
      "description": "New savings deposit",
      "before_value": { "balance": 45000 },
      "after_value": { "balance": 50000 },
      "ip_address": "192.168.1.1",
      "created_at": "2024-08-01T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "totalPages": 25
  }
}
```

**Audited Actions:**
- `members.register` - New member registration
- `members.update` - Member update
- `transactions.*` - All transaction types
- `fines.create` - Fine issued
- `fines.payment` - Fine payment
- `loans.apply` - Loan application
- `settings.update` - Setting change

---

## Transaction Types Reference

### Deposit Types (Credit)
| Type | Account | Effect |
|------|---------|--------|
| savings_deposit | savings | +amount |
| contribution_monthly | contributions | +amount |
| contribution_special | contributions | +amount |
| contribution_development | contributions | +amount |
| welfare_deposit | welfare | +amount |
| fine_payment | fines | -amount |
| loan_repayment | loans | +amount |

### Withdrawal Types (Debit)
| Type | Account | Effect |
|------|---------|--------|
| savings_withdrawal | savings | -amount |
| welfare_disbursement | welfare | -amount |
| loan_disbursement | loans | -amount |
| registration_fee | fees | -amount |
| annual_fee | fees | -amount |

### Adjustments
| Type | Effect |
|------|--------|
| savings_adjustment | ±amount |
| reversal | Undo original |

---

## Error Codes

| HTTP Status | Success | Description |
|-------------|---------|-------------|
| 200 | true | Successful GET |
| 201 | true | Resource created |
| 400 | false | Validation error |
| 401 | false | Authentication required |
| 404 | false | Resource not found |
| 500 | false | Server error |

---

## Version

Current API Version: **1.0.1**  
System: YUNITE Enterprise Operating System  
Documentation: This file
