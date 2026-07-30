export declare abstract class ValueObject {
    protected abstract getEqualityComponents(): any[];
    equals(other: ValueObject): boolean;
}
export declare class Money extends ValueObject {
    readonly amount: number;
    readonly currency: string;
    constructor(amount: number, currency?: string);
    protected getEqualityComponents(): any[];
    add(other: Money): Money;
    subtract(other: Money): Money;
    multiply(factor: number): Money;
    isGreaterThan(other: Money): boolean;
    isLessThan(other: Money): boolean;
    isZero(): boolean;
    static zero(currency?: string): Money;
}
export declare class Percentage extends ValueObject {
    readonly value: number;
    constructor(value: number);
    protected getEqualityComponents(): any[];
    applyTo(amount: Money): Money;
    asDecimal(): number;
}
export declare class Address extends ValueObject {
    readonly street: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly country: string;
    constructor(street: string, city: string, state: string, postalCode: string, country: string);
    protected getEqualityComponents(): any[];
}
export declare class ContactInfo extends ValueObject {
    readonly phone: string;
    readonly email: string;
    readonly alternativePhone?: string | undefined;
    constructor(phone: string, email: string, alternativePhone?: string | undefined);
    protected getEqualityComponents(): any[];
}
export declare enum TransactionType {
    SAVINGS_DEPOSIT = "SAVINGS_DEPOSIT",
    SAVINGS_WITHDRAWAL = "SAVINGS_WITHDRAWAL",
    LOAN_DISBURSEMENT = "LOAN_DISBURSEMENT",
    LOAN_REPAYMENT = "LOAN_REPAYMENT",
    SHARE_PURCHASE = "SHARE_PURCHASE",
    FINE_PAYMENT = "FINE_PAYMENT",
    PENALTY_PAYMENT = "PENALTY_PAYMENT",
    DONATION = "DONATION",
    GRANT = "GRANT",
    EXPENSE = "EXPENSE",
    INCOME = "INCOME",
    PAYROLL = "PAYROLL",
    PROJECT_PAYMENT = "PROJECT_PAYMENT",
    DIVIDEND_DISTRIBUTION = "DIVIDEND_DISTRIBUTION",
    REFUND = "REFUND",
    TRANSFER = "TRANSFER",
    ADJUSTMENT = "ADJUSTMENT",
    REVERSAL = "REVERSAL",
    EMERGENCY_FUND = "EMERGENCY_FUND",
    UNITY_FUND = "UNITY_FUND",
    TABLE_BANKING = "TABLE_BANKING",
    INVESTMENT = "INVESTMENT",
    INSURANCE_PREMIUM = "INSURANCE_PREMIUM",
    WELFARE_CONTRIBUTION = "WELFARE_CONTRIBUTION",
    MEMBERSHIP_FEE = "MEMBERSHIP_FEE",
    INTEREST_PAYMENT = "INTEREST_PAYMENT",
    DIVIDEND_PAYMENT = "DIVIDEND_PAYMENT",
    PROFIT_DISTRIBUTION = "PROFIT_DISTRIBUTION",
    COMMISSION = "COMMISSION",
    FEE = "FEE",
    CHARGE = "CHARGE",
    REVERSAL_ENTRY = "REVERSAL_ENTRY"
}
export declare enum AccountStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    FROZEN = "FROZEN",
    CLOSED = "CLOSED",
    DORMANT = "DORMANT",
    SUSPENDED = "SUSPENDED",
    PENDING_ACTIVATION = "PENDING_ACTIVATION"
}
export declare enum ApprovalStatus {
    DRAFT = "DRAFT",
    SUBMITTED = "SUBMITTED",
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    CANCELLED = "CANCELLED",
    COMPLETED = "COMPLETED",
    PARTIALLY_APPROVED = "PARTIALLY_APPROVED",
    AWAITING_REVIEW = "AWAITING_REVIEW",
    RETURNED_FOR_REVISION = "RETURNED_FOR_REVISION"
}
export declare enum MemberType {
    INDIVIDUAL = "INDIVIDUAL",
    GROUP = "GROUP",
    CORPORATE = "CORPORATE",
    JOINT = "JOINT",
    MINOR = "MINOR"
}
export declare enum OrganizationType {
    CBO = "CBO",
    SACCO = "SACCO",
    NGO = "NGO",
    COOPERATIVE = "COOPERATIVE",
    ASSOCIATION = "ASSOCIATION",
    CHAMA = "CHAMA",
    SELF_HELP_GROUP = "SELF_HELP_GROUP",
    INVESTMENT_CLUB = "INVESTMENT_CLUB",
    FAITH_ORGANIZATION = "FAITH_ORGANIZATION",
    MULTI_BRANCH = "MULTI_BRANCH",
    MICROFINANCE = "MICROFINANCE",
    VILLAGE_BANK = "VILLAGE_BANK"
}
export declare enum LoanStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    DISBURSED = "DISBURSED",
    ACTIVE = "ACTIVE",
    REPAID = "REPAID",
    DEFAULTED = "DEFAULTED",
    WRITTEN_OFF = "WRITTEN_OFF",
    RESTRUCTURED = "RESTRUCTURED",
    SUSPENDED = "SUSPENDED",
    CANCELLED = "CANCELLED"
}
export declare enum ProjectStatus {
    PLANNING = "PLANNING",
    ACTIVE = "ACTIVE",
    ON_HOLD = "ON_HOLD",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    CLOSED = "CLOSED"
}
export declare enum RiskLevel {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL"
}
export declare enum EventType {
    MEMBER_CREATED = "MEMBER_CREATED",
    MEMBER_UPDATED = "MEMBER_UPDATED",
    ACCOUNT_CREATED = "ACCOUNT_CREATED",
    TRANSACTION_POSTED = "TRANSACTION_POSTED",
    LOAN_APPROVED = "LOAN_APPROVED",
    LOAN_DISBURSED = "LOAN_DISBURSED",
    LOAN_REPAID = "LOAN_REPAID",
    SAVINGS_DEPOSIT = "SAVINGS_DEPOSIT",
    SAVINGS_WITHDRAWAL = "SAVINGS_WITHDRAWAL",
    SHARE_PURCHASED = "SHARE_PURCHASED",
    DIVIDEND_DECLARED = "DIVIDEND_DECLARED",
    PROJECT_CREATED = "PROJECT_CREATED",
    PROJECT_COMPLETED = "PROJECT_COMPLETED",
    PROFIT_DISTRIBUTED = "PROFIT_DISTRIBUTED",
    AUDIT_TRAIL = "AUDIT_TRAIL",
    SYSTEM_ALERT = "SYSTEM_ALERT",
    FRAUD_DETECTED = "FRAUD_DETECTED",
    RISK_ALERT = "RISK_ALERT",
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
    APPROVAL_COMPLETED = "APPROVAL_COMPLETED",
    WORKFLOW_STEP = "WORKFLOW_STEP",
    NOTIFICATION_SENT = "NOTIFICATION_SENT",
    REPORT_GENERATED = "REPORT_GENERATED",
    BACKUP_COMPLETED = "BACKUP_COMPLETED",
    ERROR_OCCURRED = "ERROR_OCCURRED"
}
//# sourceMappingURL=ValueObject.d.ts.map