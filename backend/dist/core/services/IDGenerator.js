"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDGenerator = void 0;
const uuid_1 = require("uuid");
class IDGenerator {
    static uuid() {
        return (0, uuid_1.v4)();
    }
    static memberNumber() {
        const prefix = 'MBR';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static accountNumber() {
        const prefix = 'ACC';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static transactionNumber() {
        const prefix = 'TXN';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static loanNumber() {
        const prefix = 'LOAN';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static entryNumber() {
        const prefix = 'JE';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static referenceNumber() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `REF-${timestamp}${random}`;
    }
    static ticketNumber() {
        const prefix = 'TKT';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static projectCode() {
        const prefix = 'PRJ';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static cycleNumber() {
        const prefix = 'CYC';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static policyNumber() {
        const prefix = 'POL';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static claimNumber() {
        const prefix = 'CLM';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static employeeNumber() {
        const prefix = 'EMP';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static payrollRunNumber() {
        const prefix = 'PR';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static contractNumber() {
        const prefix = 'CNT';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static procurementNumber() {
        const prefix = 'PRQ';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static complianceNumber() {
        const prefix = 'CMP';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static assessmentNumber() {
        const prefix = 'RSK';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static alertNumber() {
        const prefix = 'FRD';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
    static productCode(prefix) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    }
}
exports.IDGenerator = IDGenerator;
//# sourceMappingURL=IDGenerator.js.map