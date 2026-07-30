"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = exports.RiskLevel = exports.ProjectStatus = exports.LoanStatus = exports.OrganizationType = exports.MemberType = exports.ApprovalStatus = exports.AccountStatus = exports.TransactionType = exports.ContactInfo = exports.Address = exports.Percentage = exports.Money = exports.ValueObject = void 0;
class ValueObject {
    equals(other) {
        if (other === null || other === undefined)
            return false;
        if (other.constructor !== this.constructor)
            return false;
        return this.getEqualityComponents().every((component, index) => component === other.getEqualityComponents()[index]);
    }
}
exports.ValueObject = ValueObject;
class Money extends ValueObject {
    amount;
    currency;
    constructor(amount, currency = 'KES') {
        super();
        this.amount = amount;
        this.currency = currency;
        if (amount < 0)
            throw new Error('Amount cannot be negative');
    }
    getEqualityComponents() {
        return [this.amount, this.currency];
    }
    add(other) {
        if (this.currency !== other.currency)
            throw new Error('Currency mismatch');
        return new Money(this.amount + other.amount, this.currency);
    }
    subtract(other) {
        if (this.currency !== other.currency)
            throw new Error('Currency mismatch');
        if (this.amount < other.amount)
            throw new Error('Insufficient funds');
        return new Money(this.amount - other.amount, this.currency);
    }
    multiply(factor) {
        return new Money(this.amount * factor, this.currency);
    }
    isGreaterThan(other) {
        return this.amount > other.amount;
    }
    isLessThan(other) {
        return this.amount < other.amount;
    }
    isZero() {
        return this.amount === 0;
    }
    static zero(currency = 'KES') {
        return new Money(0, currency);
    }
}
exports.Money = Money;
class Percentage extends ValueObject {
    value;
    constructor(value) {
        super();
        this.value = value;
        if (value < 0 || value > 100)
            throw new Error('Percentage must be between 0 and 100');
    }
    getEqualityComponents() {
        return [this.value];
    }
    applyTo(amount) {
        return new Money((amount.amount * this.value) / 100, amount.currency);
    }
    asDecimal() {
        return this.value / 100;
    }
}
exports.Percentage = Percentage;
class Address extends ValueObject {
    street;
    city;
    state;
    postalCode;
    country;
    constructor(street, city, state, postalCode, country) {
        super();
        this.street = street;
        this.city = city;
        this.state = state;
        this.postalCode = postalCode;
        this.country = country;
    }
    getEqualityComponents() {
        return [this.street, this.city, this.state, this.postalCode, this.country];
    }
}
exports.Address = Address;
class ContactInfo extends ValueObject {
    phone;
    email;
    alternativePhone;
    constructor(phone, email, alternativePhone) {
        super();
        this.phone = phone;
        this.email = email;
        this.alternativePhone = alternativePhone;
    }
    getEqualityComponents() {
        return [this.phone, this.email, this.alternativePhone || ''];
    }
}
exports.ContactInfo = ContactInfo;
var TransactionType;
(function (TransactionType) {
    TransactionType["SAVINGS_DEPOSIT"] = "SAVINGS_DEPOSIT";
    TransactionType["SAVINGS_WITHDRAWAL"] = "SAVINGS_WITHDRAWAL";
    TransactionType["LOAN_DISBURSEMENT"] = "LOAN_DISBURSEMENT";
    TransactionType["LOAN_REPAYMENT"] = "LOAN_REPAYMENT";
    TransactionType["SHARE_PURCHASE"] = "SHARE_PURCHASE";
    TransactionType["FINE_PAYMENT"] = "FINE_PAYMENT";
    TransactionType["PENALTY_PAYMENT"] = "PENALTY_PAYMENT";
    TransactionType["DONATION"] = "DONATION";
    TransactionType["GRANT"] = "GRANT";
    TransactionType["EXPENSE"] = "EXPENSE";
    TransactionType["INCOME"] = "INCOME";
    TransactionType["PAYROLL"] = "PAYROLL";
    TransactionType["PROJECT_PAYMENT"] = "PROJECT_PAYMENT";
    TransactionType["DIVIDEND_DISTRIBUTION"] = "DIVIDEND_DISTRIBUTION";
    TransactionType["REFUND"] = "REFUND";
    TransactionType["TRANSFER"] = "TRANSFER";
    TransactionType["ADJUSTMENT"] = "ADJUSTMENT";
    TransactionType["REVERSAL"] = "REVERSAL";
    TransactionType["EMERGENCY_FUND"] = "EMERGENCY_FUND";
    TransactionType["UNITY_FUND"] = "UNITY_FUND";
    TransactionType["TABLE_BANKING"] = "TABLE_BANKING";
    TransactionType["INVESTMENT"] = "INVESTMENT";
    TransactionType["INSURANCE_PREMIUM"] = "INSURANCE_PREMIUM";
    TransactionType["WELFARE_CONTRIBUTION"] = "WELFARE_CONTRIBUTION";
    TransactionType["MEMBERSHIP_FEE"] = "MEMBERSHIP_FEE";
    TransactionType["INTEREST_PAYMENT"] = "INTEREST_PAYMENT";
    TransactionType["DIVIDEND_PAYMENT"] = "DIVIDEND_PAYMENT";
    TransactionType["PROFIT_DISTRIBUTION"] = "PROFIT_DISTRIBUTION";
    TransactionType["COMMISSION"] = "COMMISSION";
    TransactionType["FEE"] = "FEE";
    TransactionType["CHARGE"] = "CHARGE";
    TransactionType["REVERSAL_ENTRY"] = "REVERSAL_ENTRY";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var AccountStatus;
(function (AccountStatus) {
    AccountStatus["ACTIVE"] = "ACTIVE";
    AccountStatus["INACTIVE"] = "INACTIVE";
    AccountStatus["FROZEN"] = "FROZEN";
    AccountStatus["CLOSED"] = "CLOSED";
    AccountStatus["DORMANT"] = "DORMANT";
    AccountStatus["SUSPENDED"] = "SUSPENDED";
    AccountStatus["PENDING_ACTIVATION"] = "PENDING_ACTIVATION";
})(AccountStatus || (exports.AccountStatus = AccountStatus = {}));
var ApprovalStatus;
(function (ApprovalStatus) {
    ApprovalStatus["DRAFT"] = "DRAFT";
    ApprovalStatus["SUBMITTED"] = "SUBMITTED";
    ApprovalStatus["PENDING"] = "PENDING";
    ApprovalStatus["APPROVED"] = "APPROVED";
    ApprovalStatus["REJECTED"] = "REJECTED";
    ApprovalStatus["CANCELLED"] = "CANCELLED";
    ApprovalStatus["COMPLETED"] = "COMPLETED";
    ApprovalStatus["PARTIALLY_APPROVED"] = "PARTIALLY_APPROVED";
    ApprovalStatus["AWAITING_REVIEW"] = "AWAITING_REVIEW";
    ApprovalStatus["RETURNED_FOR_REVISION"] = "RETURNED_FOR_REVISION";
})(ApprovalStatus || (exports.ApprovalStatus = ApprovalStatus = {}));
var MemberType;
(function (MemberType) {
    MemberType["INDIVIDUAL"] = "INDIVIDUAL";
    MemberType["GROUP"] = "GROUP";
    MemberType["CORPORATE"] = "CORPORATE";
    MemberType["JOINT"] = "JOINT";
    MemberType["MINOR"] = "MINOR";
})(MemberType || (exports.MemberType = MemberType = {}));
var OrganizationType;
(function (OrganizationType) {
    OrganizationType["CBO"] = "CBO";
    OrganizationType["SACCO"] = "SACCO";
    OrganizationType["NGO"] = "NGO";
    OrganizationType["COOPERATIVE"] = "COOPERATIVE";
    OrganizationType["ASSOCIATION"] = "ASSOCIATION";
    OrganizationType["CHAMA"] = "CHAMA";
    OrganizationType["SELF_HELP_GROUP"] = "SELF_HELP_GROUP";
    OrganizationType["INVESTMENT_CLUB"] = "INVESTMENT_CLUB";
    OrganizationType["FAITH_ORGANIZATION"] = "FAITH_ORGANIZATION";
    OrganizationType["MULTI_BRANCH"] = "MULTI_BRANCH";
    OrganizationType["MICROFINANCE"] = "MICROFINANCE";
    OrganizationType["VILLAGE_BANK"] = "VILLAGE_BANK";
})(OrganizationType || (exports.OrganizationType = OrganizationType = {}));
var LoanStatus;
(function (LoanStatus) {
    LoanStatus["PENDING"] = "PENDING";
    LoanStatus["APPROVED"] = "APPROVED";
    LoanStatus["DISBURSED"] = "DISBURSED";
    LoanStatus["ACTIVE"] = "ACTIVE";
    LoanStatus["REPAID"] = "REPAID";
    LoanStatus["DEFAULTED"] = "DEFAULTED";
    LoanStatus["WRITTEN_OFF"] = "WRITTEN_OFF";
    LoanStatus["RESTRUCTURED"] = "RESTRUCTURED";
    LoanStatus["SUSPENDED"] = "SUSPENDED";
    LoanStatus["CANCELLED"] = "CANCELLED";
})(LoanStatus || (exports.LoanStatus = LoanStatus = {}));
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["PLANNING"] = "PLANNING";
    ProjectStatus["ACTIVE"] = "ACTIVE";
    ProjectStatus["ON_HOLD"] = "ON_HOLD";
    ProjectStatus["COMPLETED"] = "COMPLETED";
    ProjectStatus["CANCELLED"] = "CANCELLED";
    ProjectStatus["CLOSED"] = "CLOSED";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "LOW";
    RiskLevel["MEDIUM"] = "MEDIUM";
    RiskLevel["HIGH"] = "HIGH";
    RiskLevel["CRITICAL"] = "CRITICAL";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
var EventType;
(function (EventType) {
    EventType["MEMBER_CREATED"] = "MEMBER_CREATED";
    EventType["MEMBER_UPDATED"] = "MEMBER_UPDATED";
    EventType["ACCOUNT_CREATED"] = "ACCOUNT_CREATED";
    EventType["TRANSACTION_POSTED"] = "TRANSACTION_POSTED";
    EventType["LOAN_APPROVED"] = "LOAN_APPROVED";
    EventType["LOAN_DISBURSED"] = "LOAN_DISBURSED";
    EventType["LOAN_REPAID"] = "LOAN_REPAID";
    EventType["SAVINGS_DEPOSIT"] = "SAVINGS_DEPOSIT";
    EventType["SAVINGS_WITHDRAWAL"] = "SAVINGS_WITHDRAWAL";
    EventType["SHARE_PURCHASED"] = "SHARE_PURCHASED";
    EventType["DIVIDEND_DECLARED"] = "DIVIDEND_DECLARED";
    EventType["PROJECT_CREATED"] = "PROJECT_CREATED";
    EventType["PROJECT_COMPLETED"] = "PROJECT_COMPLETED";
    EventType["PROFIT_DISTRIBUTED"] = "PROFIT_DISTRIBUTED";
    EventType["AUDIT_TRAIL"] = "AUDIT_TRAIL";
    EventType["SYSTEM_ALERT"] = "SYSTEM_ALERT";
    EventType["FRAUD_DETECTED"] = "FRAUD_DETECTED";
    EventType["RISK_ALERT"] = "RISK_ALERT";
    EventType["APPROVAL_REQUESTED"] = "APPROVAL_REQUESTED";
    EventType["APPROVAL_COMPLETED"] = "APPROVAL_COMPLETED";
    EventType["WORKFLOW_STEP"] = "WORKFLOW_STEP";
    EventType["NOTIFICATION_SENT"] = "NOTIFICATION_SENT";
    EventType["REPORT_GENERATED"] = "REPORT_GENERATED";
    EventType["BACKUP_COMPLETED"] = "BACKUP_COMPLETED";
    EventType["ERROR_OCCURRED"] = "ERROR_OCCURRED";
})(EventType || (exports.EventType = EventType = {}));
//# sourceMappingURL=ValueObject.js.map