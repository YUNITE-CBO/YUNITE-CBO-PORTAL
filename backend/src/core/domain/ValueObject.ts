export abstract class ValueObject {
  protected abstract getEqualityComponents(): any[];

  public equals(other: ValueObject): boolean {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return this.getEqualityComponents().every((component, index) => 
      component === other.getEqualityComponents()[index]
    );
  }
}

export class Money extends ValueObject {
  constructor(
    public readonly amount: number,
    public readonly currency: string = 'KES'
  ) {
    super();
    if (amount < 0) throw new Error('Amount cannot be negative');
  }

  protected getEqualityComponents(): any[] {
    return [this.amount, this.currency];
  }

  public add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Currency mismatch');
    return new Money(this.amount + other.amount, this.currency);
  }

  public subtract(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Currency mismatch');
    if (this.amount < other.amount) throw new Error('Insufficient funds');
    return new Money(this.amount - other.amount, this.currency);
  }

  public multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  public isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  public isLessThan(other: Money): boolean {
    return this.amount < other.amount;
  }

  public isZero(): boolean {
    return this.amount === 0;
  }

  public static zero(currency: string = 'KES'): Money {
    return new Money(0, currency);
  }
}

export class Percentage extends ValueObject {
  constructor(public readonly value: number) {
    super();
    if (value < 0 || value > 100) throw new Error('Percentage must be between 0 and 100');
  }

  protected getEqualityComponents(): any[] {
    return [this.value];
  }

  public applyTo(amount: Money): Money {
    return new Money((amount.amount * this.value) / 100, amount.currency);
  }

  public asDecimal(): number {
    return this.value / 100;
  }
}

export class Address extends ValueObject {
  constructor(
    public readonly street: string,
    public readonly city: string,
    public readonly state: string,
    public readonly postalCode: string,
    public readonly country: string
  ) {
    super();
  }

  protected getEqualityComponents(): any[] {
    return [this.street, this.city, this.state, this.postalCode, this.country];
  }
}

export class ContactInfo extends ValueObject {
  constructor(
    public readonly phone: string,
    public readonly email: string,
    public readonly alternativePhone?: string
  ) {
    super();
  }

  protected getEqualityComponents(): any[] {
    return [this.phone, this.email, this.alternativePhone || ''];
  }
}

export enum TransactionType {
  SAVINGS_DEPOSIT = 'SAVINGS_DEPOSIT',
  SAVINGS_WITHDRAWAL = 'SAVINGS_WITHDRAWAL',
  LOAN_DISBURSEMENT = 'LOAN_DISBURSEMENT',
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
  SHARE_PURCHASE = 'SHARE_PURCHASE',
  FINE_PAYMENT = 'FINE_PAYMENT',
  PENALTY_PAYMENT = 'PENALTY_PAYMENT',
  DONATION = 'DONATION',
  GRANT = 'GRANT',
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  PAYROLL = 'PAYROLL',
  PROJECT_PAYMENT = 'PROJECT_PAYMENT',
  DIVIDEND_DISTRIBUTION = 'DIVIDEND_DISTRIBUTION',
  REFUND = 'REFUND',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  UNITY_FUND = 'UNITY_FUND',
  TABLE_BANKING = 'TABLE_BANKING',
  INVESTMENT = 'INVESTMENT',
  INSURANCE_PREMIUM = 'INSURANCE_PREMIUM',
  WELFARE_CONTRIBUTION = 'WELFARE_CONTRIBUTION',
  MEMBERSHIP_FEE = 'MEMBERSHIP_FEE',
  INTEREST_PAYMENT = 'INTEREST_PAYMENT',
  DIVIDEND_PAYMENT = 'DIVIDEND_PAYMENT',
  PROFIT_DISTRIBUTION = 'PROFIT_DISTRIBUTION',
  COMMISSION = 'COMMISSION',
  FEE = 'FEE',
  CHARGE = 'CHARGE',
  REVERSAL_ENTRY = 'REVERSAL_ENTRY'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
  DORMANT = 'DORMANT',
  SUSPENDED = 'SUSPENDED',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION'
}

export enum ApprovalStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  PARTIALLY_APPROVED = 'PARTIALLY_APPROVED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  RETURNED_FOR_REVISION = 'RETURNED_FOR_REVISION'
}

export enum MemberType {
  INDIVIDUAL = 'INDIVIDUAL',
  GROUP = 'GROUP',
  CORPORATE = 'CORPORATE',
  JOINT = 'JOINT',
  MINOR = 'MINOR'
}

export enum OrganizationType {
  CBO = 'CBO',
  SACCO = 'SACCO',
  NGO = 'NGO',
  COOPERATIVE = 'COOPERATIVE',
  ASSOCIATION = 'ASSOCIATION',
  CHAMA = 'CHAMA',
  SELF_HELP_GROUP = 'SELF_HELP_GROUP',
  INVESTMENT_CLUB = 'INVESTMENT_CLUB',
  FAITH_ORGANIZATION = 'FAITH_ORGANIZATION',
  MULTI_BRANCH = 'MULTI_BRANCH',
  MICROFINANCE = 'MICROFINANCE',
  VILLAGE_BANK = 'VILLAGE_BANK'
}

export enum LoanStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DISBURSED = 'DISBURSED',
  ACTIVE = 'ACTIVE',
  REPAID = 'REPAID',
  DEFAULTED = 'DEFAULTED',
  WRITTEN_OFF = 'WRITTEN_OFF',
  RESTRUCTURED = 'RESTRUCTURED',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED'
}

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED'
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum EventType {
  MEMBER_CREATED = 'MEMBER_CREATED',
  MEMBER_UPDATED = 'MEMBER_UPDATED',
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  TRANSACTION_POSTED = 'TRANSACTION_POSTED',
  LOAN_APPROVED = 'LOAN_APPROVED',
  LOAN_DISBURSED = 'LOAN_DISBURSED',
  LOAN_REPAID = 'LOAN_REPAID',
  SAVINGS_DEPOSIT = 'SAVINGS_DEPOSIT',
  SAVINGS_WITHDRAWAL = 'SAVINGS_WITHDRAWAL',
  SHARE_PURCHASED = 'SHARE_PURCHASED',
  DIVIDEND_DECLARED = 'DIVIDEND_DECLARED',
  PROJECT_CREATED = 'PROJECT_CREATED',
  PROJECT_COMPLETED = 'PROJECT_COMPLETED',
  PROFIT_DISTRIBUTED = 'PROFIT_DISTRIBUTED',
  AUDIT_TRAIL = 'AUDIT_TRAIL',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  RISK_ALERT = 'RISK_ALERT',
  APPROVAL_REQUESTED = 'APPROVAL_REQUESTED',
  APPROVAL_COMPLETED = 'APPROVAL_COMPLETED',
  WORKFLOW_STEP = 'WORKFLOW_STEP',
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',
  REPORT_GENERATED = 'REPORT_GENERATED',
  BACKUP_COMPLETED = 'BACKUP_COMPLETED',
  ERROR_OCCURRED = 'ERROR_OCCURRED'
}