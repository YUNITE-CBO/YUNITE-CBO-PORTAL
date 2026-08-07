/**
 * ENTERPRISE DOCUMENT & MEDIA SERVICE - MODULE CONFIGURATIONS
 * 
 * This file defines the business rules, lifecycle, validation rules,
 * and presentation for each module's document usage.
 * 
 * Each module defines:
 * - Lifecycle: Status transitions and workflow
 * - Validation: Required files, formats, sizes
 * - Permissions: Who can upload, verify, approve
 * - Storage: Bucket organization
 * - Presentation: How documents are displayed
 */

import { ModuleType, DocumentCategoryConfig, DocumentBehavior } from './types';

// =============================================================================
// MEMBER DOCUMENTS CONFIGURATION
// =============================================================================

export const MemberDocumentsConfig = {
  module: 'members' as ModuleType,
  
  // Document categories with business rules
  categories: {
    profile_photo: {
      code: 'member_passport_photo',
      name: 'Passport Photograph',
      description: 'Recent passport-size photograph for member identification',
      isRequired: true,
      isActive: true,
      sortOrder: 1,
      requireVerification: false,
      workflowRequired: false,
      maxFileSizeMb: 15,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      lifecycle: ['draft', 'pending', 'approved'],
      autoApprove: false,
      presentation: {
        isAvatar: true,
        thumbnail: true,
        displayLatest: true,
      },
      metadata: {
        dimension: { width: 300, height: 300 },
        aspectRatio: '1:1',
      },
    } as DocumentCategoryConfig,
    
    national_id: {
      code: 'member_national_id',
      name: 'National ID',
      description: 'Kenya national identification card',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'under_review', 'approved', 'rejected'],
      expiryRequired: true,
      expiryYears: 10,
      presentation: {
        showExpiry: true,
        verificationBadge: true,
      },
    } as DocumentCategoryConfig,
    
    kra_pin: {
      code: 'member_kra_pin',
      name: 'KRA PIN Certificate',
      description: 'Kenya Revenue Authority PIN certificate',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      expiryRequired: true,
      expiryYears: 1,
    } as DocumentCategoryConfig,
    
    proof_residence: {
      code: 'member_proof_residence',
      name: 'Proof of Residence',
      description: 'Utility bill or official document showing current address',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      expiryRequired: true,
      expiryMonths: 6,
    } as DocumentCategoryConfig,
    
    application_form: {
      code: 'member_application_form',
      name: 'Membership Application Form',
      description: 'Signed membership application form',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      presentation: {
        showSigner: true,
      },
    } as DocumentCategoryConfig,
    
    member_agreement: {
      code: 'member_agreement',
      name: 'Member Agreement',
      description: 'Signed membership agreement/contract',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      requiresWitness: true,
    } as DocumentCategoryConfig,
    
    consent_form: {
      code: 'member_consent_form',
      name: 'Consent Form',
      description: 'Data protection and consent form',
      isRequired: false,
      maxFileSizeMb: 25,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
    } as DocumentCategoryConfig,
    
    passport: {
      code: 'member_passport',
      name: 'Passport',
      description: 'Valid passport (if applicable)',
      isRequired: false,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      expiryRequired: true,
      expiryYears: 10,
    } as DocumentCategoryConfig,
    
    certificate: {
      code: 'member_certificate',
      name: 'Certificate/Qualification',
      description: 'Educational or professional certificates',
      isRequired: false,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'approved'],
    } as DocumentCategoryConfig,
    
    employment: {
      code: 'member_employment',
      name: 'Employment Record',
      description: 'Employment letter or payslips',
      isRequired: false,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'approved'],
      expiryRequired: true,
      expiryMonths: 12,
    } as DocumentCategoryConfig,
    
    recommendation: {
      code: 'member_recommendation',
      name: 'Recommendation Letter',
      description: 'Professional or personal recommendation',
      isRequired: false,
      maxFileSizeMb: 25,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      requiresSignature: true,
    } as DocumentCategoryConfig,
  },
  
  // Compliance rules
  compliance: {
    requiredForApproval: ['member_passport_photo', 'member_national_id', 'member_kra_pin', 
                        'member_proof_residence', 'member_application_form', 'member_agreement'],
    autoApprovalThreshold: 100, // Percentage
    reminderDays: [30, 7, 1], // Days before expiry to send reminders
  },
  
  // Workflow
  workflow: {
    stages: [
      { id: 'documentation', name: 'Documentation', order: 1 },
      { id: 'review', name: 'Admin Review', order: 2 },
      { id: 'approval', name: 'Final Approval', order: 3 },
    ],
    requiresApproval: true,
    approverRoles: ['admin', 'super_admin'],
  },
  
  // Storage
  storage: {
    bucket: 'member-documents',
    pathPattern: '{member_id}/{category}/{timestamp}_{filename}',
    versionInPath: true,
  },
};

// =============================================================================
// LOAN DOCUMENTS CONFIGURATION
// =============================================================================

export const LoanDocumentsConfig = {
  module: 'loans' as ModuleType,
  
  categories: {
    application: {
      code: 'loan_application',
      name: 'Loan Application Form',
      description: 'Completed loan application form',
      isRequired: true,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
    
    agreement: {
      code: 'loan_agreement',
      name: 'Loan Agreement',
      description: 'Signed loan agreement/contract',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      requiresWitness: true,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
    
    guarantor_id: {
      code: 'loan_guarantor',
      name: 'Guarantor Documents',
      description: 'Guarantor identification and signed agreement',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      linkedToEntity: 'guarantor',
    } as DocumentCategoryConfig,
    
    guarantor_income: {
      code: 'loan_guarantor_income',
      name: 'Guarantor Income Proof',
      description: 'Guarantor payslips or bank statements',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'approved'],
      linkedToEntity: 'guarantor',
    } as DocumentCategoryConfig,
    
    collateral: {
      code: 'loan_collateral',
      name: 'Collateral Documentation',
      description: 'Collateral ownership documents',
      isRequired: false,
      maxFileSizeMb: 15,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      linkedToEntity: 'collateral',
    } as DocumentCategoryConfig,
    
    collateral_valuation: {
      code: 'loan_collateral_valuation',
      name: 'Collateral Valuation',
      description: 'Professional valuation report',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      linkedToEntity: 'collateral',
    } as DocumentCategoryConfig,
    
    repayment_schedule: {
      code: 'loan_repayment_schedule',
      name: 'Repayment Schedule',
      description: 'Agreed repayment schedule',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
    
    bank_statement: {
      code: 'loan_bank_statement',
      name: 'Bank Statement',
      description: 'Recent bank statements for assessment',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      expiryRequired: true,
      expiryMonths: 3,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
    
    approval_letter: {
      code: 'loan_approval_letter',
      name: 'Approval Letter',
      description: 'Official loan approval letter',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      generatedBySystem: true,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
    
    disbursement_receipt: {
      code: 'loan_disbursement_receipt',
      name: 'Disbursement Receipt',
      description: 'Signed disbursement receipt',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      requiresSignature: true,
      linkedToEntity: 'loan',
    } as DocumentCategoryConfig,
  },
  
  // Loan-specific rules
  loanRules: {
    requireGuarantor: true,
    guarantorMinimumCount: 1,
    collateralRequiredForAmount: 100000, // Above this amount
    maxLoanWithoutCollateral: 50000,
  },
  
  workflow: {
    stages: [
      { id: 'application', name: 'Application', order: 1 },
      { id: 'assessment', name: 'Credit Assessment', order: 2 },
      { id: 'approval', name: 'Approval', order: 3 },
      { id: 'disbursement', name: 'Disbursement', order: 4 },
    ],
    requiresApproval: true,
    approverRoles: ['admin', 'super_admin'],
  },
  
  storage: {
    bucket: 'loan-documents',
    pathPattern: '{loan_id}/{category}/{timestamp}_{filename}',
  },
};

// =============================================================================
// FINANCIAL DOCUMENTS CONFIGURATION
// =============================================================================

export const FinancialDocumentsConfig = {
  module: 'financial' as ModuleType,
  
  categories: {
    receipt: {
      code: 'financial_receipt',
      name: 'Receipt',
      description: 'Payment or purchase receipt',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      lifecycle: ['draft', 'approved'],
      retentionYears: 7,
      linkedToEntity: 'transaction',
    } as DocumentCategoryConfig,
    
    invoice: {
      code: 'financial_invoice',
      name: 'Invoice',
      description: 'Supplier or service invoice',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      retentionYears: 7,
      linkedToEntity: 'transaction',
    } as DocumentCategoryConfig,
    
    quotation: {
      code: 'financial_quotation',
      name: 'Quotation',
      description: 'Quotation or price proposal',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      retentionYears: 3,
    } as DocumentCategoryConfig,
    
    payment_voucher: {
      code: 'financial_voucher',
      name: 'Payment Voucher',
      description: 'Approved payment voucher with authorization',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      requiresSignature: true,
      requiresApproval: true,
      approverRoles: ['admin', 'super_admin'],
      retentionYears: 7,
      linkedToEntity: 'transaction',
    } as DocumentCategoryConfig,
    
    bank_statement: {
      code: 'financial_bank_statement',
      name: 'Bank Statement',
      description: 'Bank statement for reconciliation',
      isRequired: false,
      maxFileSizeMb: 20,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      retentionYears: 10,
      linkedToEntity: 'account',
    } as DocumentCategoryConfig,
    
    reconciliation: {
      code: 'financial_reconciliation',
      name: 'Reconciliation Report',
      description: 'Completed reconciliation document',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      requiresSignature: true,
      retentionYears: 7,
      linkedToEntity: 'account',
    } as DocumentCategoryConfig,
    
    audit_certificate: {
      code: 'financial_audit_certificate',
      name: 'Audit Certificate',
      description: 'External audit certificate',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      retentionYears: 10,
    } as DocumentCategoryConfig,
    
    annual_report: {
      code: 'financial_annual_report',
      name: 'Annual Report',
      description: 'Annual financial report',
      isRequired: false,
      maxFileSizeMb: 20,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      retentionYears: 10,
    } as DocumentCategoryConfig,
  },
  
  workflow: {
    requiresApproval: true,
    approverRoles: ['admin', 'super_admin'],
  },
  
  storage: {
    bucket: 'financial-documents',
    pathPattern: '{year}/{month}/{category}/{filename}',
  },
  
  retention: {
    default: 7, // years
    byType: {
      receipt: 7,
      invoice: 7,
      voucher: 7,
      statement: 10,
      audit: 10,
    },
  },
};

// =============================================================================
// MEETING DOCUMENTS CONFIGURATION
// =============================================================================

export const MeetingDocumentsConfig = {
  module: 'meetings' as ModuleType,
  
  categories: {
    agenda: {
      code: 'meeting_agenda',
      name: 'Meeting Agenda',
      description: 'Planned meeting agenda and schedule',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      lifecycle: ['draft', 'approved'],
      presentation: {
        showDate: true,
        showOrganizer: true,
      },
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
    
    attendance: {
      code: 'meeting_attendance',
      name: 'Attendance Sheet',
      description: 'Signed attendance sheet with member signatures',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      lifecycle: ['draft', 'approved'],
      requiresSignature: true,
      presentation: {
        showAttendeeCount: true,
      },
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
    
    minutes: {
      code: 'meeting_minutes',
      name: 'Meeting Minutes',
      description: 'Official meeting minutes',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresApproval: true,
      approverRoles: ['admin', 'super_admin'],
      presentation: {
        showDate: true,
        showChairperson: true,
      },
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
    
    resolutions: {
      code: 'meeting_resolutions',
      name: 'Resolutions',
      description: 'Meeting resolutions document',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      requiresSignature: true,
      requiresWitness: true,
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
    
    presentation: {
      code: 'meeting_presentation',
      name: 'Presentation Materials',
      description: 'Meeting presentation slides or materials',
      isRequired: false,
      maxFileSizeMb: 100,
      allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      lifecycle: ['draft', 'approved'],
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
    
    recording: {
      code: 'meeting_recording',
      name: 'Meeting Recording',
      description: 'Audio or video recording of meeting',
      isRequired: false,
      maxFileSizeMb: 1000,
      allowedMimeTypes: ['video/mp4', 'audio/mpeg', 'audio/wav'],
      lifecycle: ['approved'],
      visibility: 'admin', // Only admins can access
      linkedToEntity: 'meeting',
    } as DocumentCategoryConfig,
  },
  
  workflow: {
    stages: [
      { id: 'preparation', name: 'Preparation', order: 1 },
      { id: 'approval', name: 'Approval', order: 2 },
    ],
    requiresApproval: true,
    approverRoles: ['admin', 'super_admin'],
  },
  
  storage: {
    bucket: 'meeting-documents',
    pathPattern: '{meeting_id}/{year}/{month}/{category}/{filename}',
  },
};

// =============================================================================
// ORGANIZATION DOCUMENTS CONFIGURATION
// =============================================================================

export const OrganizationDocumentsConfig = {
  module: 'organization' as ModuleType,
  
  categories: {
    logo: {
      code: 'org_logo',
      name: 'Organization Logo',
      description: 'Official organization logo',
      isRequired: true,
      maxFileSizeMb: 2,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml'],
      lifecycle: ['approved'],
      presentation: {
        isAvatar: true,
        displayLatest: true,
      },
      metadata: {
        dimension: { width: 500, height: 500 },
        formats: ['png', 'jpg', 'svg'],
      },
    } as DocumentCategoryConfig,
    
    logo_dark: {
      code: 'org_logo_dark',
      name: 'Logo (Dark Background)',
      description: 'Logo for use on dark backgrounds',
      isRequired: false,
      maxFileSizeMb: 2,
      allowedMimeTypes: ['image/png', 'image/svg+xml'],
      lifecycle: ['approved'],
    } as DocumentCategoryConfig,
    
    favicon: {
      code: 'org_favicon',
      name: 'Favicon',
      description: 'Website favicon',
      isRequired: false,
      maxFileSizeMb: 0.1, // 100KB
      allowedMimeTypes: ['image/png', 'image/x-icon', 'image/svg+xml'],
      lifecycle: ['approved'],
      metadata: {
        dimension: { width: 32, height: 32 },
      },
    } as DocumentCategoryConfig,
    
    registration: {
      code: 'org_registration',
      name: 'Registration Certificate',
      description: 'Business registration certificate',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      lifecycle: ['approved'],
      expiryRequired: true,
      presentation: {
        showExpiry: true,
        verificationBadge: true,
      },
    } as DocumentCategoryConfig,
    
    constitution: {
      code: 'org_constitution',
      name: 'Constitution/Governance',
      description: 'Organization constitution or governance document',
      isRequired: true,
      maxFileSizeMb: 20,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      expiryRequired: true,
      expiryYears: 1,
    } as DocumentCategoryConfig,
    
    license: {
      code: 'org_license',
      name: 'Operating License',
      description: 'Operating license or permit',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      expiryRequired: true,
    } as DocumentCategoryConfig,
    
    tax_certificate: {
      code: 'org_tax_certificate',
      name: 'Tax Compliance Certificate',
      description: 'KRA tax compliance certificate',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      expiryRequired: true,
      expiryMonths: 12,
    } as DocumentCategoryConfig,
    
    branding_guidelines: {
      code: 'org_branding_guidelines',
      name: 'Branding Guidelines',
      description: 'Brand usage guidelines and color palette',
      isRequired: false,
      maxFileSizeMb: 20,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
    } as DocumentCategoryConfig,
    
    policy_document: {
      code: 'org_policy',
      name: 'Policy Document',
      description: 'Organization policy documents',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      expiryRequired: true,
    } as DocumentCategoryConfig,
  },
  
  workflow: {
    requiresApproval: true,
    approverRoles: ['super_admin'],
  },
  
  storage: {
    bucket: 'org-documents',
    pathPattern: '{category}/{filename}',
  },
};

// =============================================================================
// NOTIFICATION DOCUMENTS CONFIGURATION
// =============================================================================

export const NotificationDocumentsConfig = {
  module: 'notifications' as ModuleType,
  
  categories: {
    email_attachment: {
      code: 'notification_email_attachment',
      name: 'Email Attachment',
      description: 'Attachment to email notification',
      isRequired: false,
      maxFileSizeMb: 25,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 
                     'application/vnd.openxmlformats-officedocument.*'],
      lifecycle: ['approved'],
      presentation: {
        showInEmail: true,
      },
      linkedToEntity: 'notification',
    } as DocumentCategoryConfig,
    
    announcement_banner: {
      code: 'notification_banner',
      name: 'Announcement Banner',
      description: 'Banner image for announcements',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
      lifecycle: ['approved'],
      metadata: {
        dimension: { width: 1200, height: 400 },
        aspectRatio: '3:1',
      },
    } as DocumentCategoryConfig,
    
    newsletter_image: {
      code: 'notification_newsletter_image',
      name: 'Newsletter Image',
      description: 'Featured image for newsletter',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      lifecycle: ['approved'],
      metadata: {
        dimension: { width: 800, height: 600 },
      },
    } as DocumentCategoryConfig,
    
    template_attachment: {
      code: 'notification_template_attachment',
      name: 'Template Attachment',
      description: 'Attachment used in notification templates',
      isRequired: false,
      maxFileSizeMb: 25,
      allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.*'],
      lifecycle: ['approved'],
      linkedToEntity: 'template',
    } as DocumentCategoryConfig,
  },
  
  storage: {
    bucket: 'notification-attachments',
    pathPattern: '{notification_id}/{filename}',
  },
  
  // Notifications don't require compliance or approval workflows
  workflow: {
    requiresApproval: false,
    autoApprove: true,
  },
};

// =============================================================================
// STATEMENTS CONFIGURATION
// =============================================================================

export const StatementDocumentsConfig = {
  module: 'statements' as ModuleType,
  
  categories: {
    account_statement: {
      code: 'statement_account',
      name: 'Account Statement',
      description: 'Periodic account statement',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      generatedBySystem: true,
      versioned: true,
      presentation: {
        showPeriod: true,
        showGeneratedDate: true,
      },
      metadata: {
        periodFormat: 'YYYY-MM',
      },
      linkedToEntity: 'account',
    } as DocumentCategoryConfig,
    
    annual_statement: {
      code: 'statement_annual',
      name: 'Annual Statement',
      description: 'Annual financial statement',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      generatedBySystem: true,
      versioned: true,
      retentionYears: 10,
    } as DocumentCategoryConfig,
    
    tax_statement: {
      code: 'statement_tax',
      name: 'Tax Statement',
      description: 'Tax deduction statement (NHIF, NSSF, etc.)',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      generatedBySystem: true,
      retentionYears: 7,
    } as DocumentCategoryConfig,
    
    certificate_of_standing: {
      code: 'statement_membership',
      name: 'Certificate of Membership',
      description: 'Certificate proving membership status',
      isRequired: false,
      maxFileSizeMb: 2,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      generatedBySystem: true,
      expiryRequired: true,
      expiryMonths: 1,
    } as DocumentCategoryConfig,
  },
  
  workflow: {
    requiresApproval: false,
    autoApprove: true, // System-generated statements are auto-approved
  },
  
  storage: {
    bucket: 'statements',
    pathPattern: '{member_id}/{year}/{month}/{category}.pdf',
    versionInPath: true,
  },
};

// =============================================================================
// WELFARE DOCUMENTS CONFIGURATION
// =============================================================================

export const WelfareDocumentsConfig = {
  module: 'welfare' as ModuleType,
  
  categories: {
    application: {
      code: 'welfare_application',
      name: 'Welfare Application',
      description: 'Welfare assistance application form',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'under_review', 'approved', 'rejected'],
      requiresSignature: true,
      linkedToEntity: 'case',
    } as DocumentCategoryConfig,
    
    medical_certificate: {
      code: 'welfare_medical',
      name: 'Medical Certificate',
      description: 'Medical certificate for health-related claims',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      lifecycle: ['draft', 'pending', 'approved', 'rejected'],
      confidentialityLevel: 'high',
      linkedToEntity: 'case',
    } as DocumentCategoryConfig,
    
    death_certificate: {
      code: 'welfare_death_certificate',
      name: 'Death Certificate',
      description: 'Official death certificate',
      isRequired: true,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      confidentialityLevel: 'high',
      linkedToEntity: 'case',
    } as DocumentCategoryConfig,
    
    police_report: {
      code: 'welfare_police_report',
      name: 'Police Report',
      description: 'Police report for emergency claims',
      isRequired: false,
      maxFileSizeMb: 10,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'pending', 'approved'],
      linkedToEntity: 'case',
    } as DocumentCategoryConfig,
    
    recommendation_letter: {
      code: 'welfare_recommendation',
      name: 'Recommendation Letter',
      description: 'Recommendation from welfare committee or employer',
      isRequired: false,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['draft', 'approved'],
      requiresSignature: true,
      linkedToEntity: 'case',
    } as DocumentCategoryConfig,
    
    disbursement_evidence: {
      code: 'welfare_disbursement_receipt',
      name: 'Disbursement Receipt',
      description: 'Signed receipt for welfare disbursement',
      isRequired: true,
      maxFileSizeMb: 5,
      allowedMimeTypes: ['application/pdf'],
      lifecycle: ['approved'],
      requiresSignature: true,
      linkedToEntity: 'disbursement',
    } as DocumentCategoryConfig,
  },
  
  workflow: {
    stages: [
      { id: 'submission', name: 'Submission', order: 1 },
      { id: 'review', name: 'Committee Review', order: 2 },
      { id: 'approval', name: 'Approval', order: 3 },
    ],
    requiresApproval: true,
    approverRoles: ['admin', 'super_admin'],
  },
  
  storage: {
    bucket: 'welfare-documents',
    pathPattern: '{case_id}/{category}/{timestamp}_{filename}',
    confidential: true,
  },
};

// =============================================================================
// EXPORT ALL CONFIGURATIONS
// =============================================================================

export const ModuleConfigurations = {
  members: MemberDocumentsConfig,
  loans: LoanDocumentsConfig,
  financial: FinancialDocumentsConfig,
  meetings: MeetingDocumentsConfig,
  organization: OrganizationDocumentsConfig,
  notifications: NotificationDocumentsConfig,
  statements: StatementDocumentsConfig,
  welfare: WelfareDocumentsConfig,
};

export type ModuleConfiguration = typeof ModuleConfigurations.members;
