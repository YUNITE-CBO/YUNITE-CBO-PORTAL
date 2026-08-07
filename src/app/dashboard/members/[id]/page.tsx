'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  alt_phone: string | null;
  alt_email: string | null;
  id_number: string | null;
  kra_pin: string | null;
  status: string;
  workflow_stage: string;
  registration_date: string;
  occupation: string | null;
  employer: string | null;
  employer_address: string | null;
  physical_address: string | null;
  postal_address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  nationality: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  preferred_language: string;
  preferred_contact_method: string;
  sms_notifications: boolean;
  email_notifications: boolean;
  membership_category: string | null;
  member_group: string | null;
  profile_photo_url: string | null;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface CalculatedBalances {
  savings: number;
  shares: number;
  contributions: number;
  welfare: number;
  fines: number;
  loans: number;
}

interface Transaction {
  id: string;
  transaction_ref: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  reversed: boolean;
}

interface Loan {
  id: string;
  loan_type: string;
  principal_amount: number;
  interest_rate: number;
  status: string;
  application_date: string;
  disbursement_date: string | null;
  due_date: string | null;
  outstanding_balance: number;
}

interface Fine {
  id: string;
  fine_type: string;
  amount: number;
  paid_amount: number;
  status: string;
  reason: string;
  created_at: string;
}

interface Document {
  id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  status: string;
  expiry_date: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  created_at: string;
  category_name: string;
  category_code: string;
  is_required: boolean;
}

interface ActivityEvent {
  id: string;
  action: string;
  description: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string;
  created_at: string;
  old_value: any;
  new_value: any;
}

interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  is_required: boolean;
  allowed_mime_types: string[];
  max_file_size_mb: number;
}

interface Committee {
  id: string;
  committee_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Project {
  id: string;
  project_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

interface StatusHistory {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

// ============================================
// LIFECYCLE STAGES CONFIG
// ============================================

type MemberStatus = 'pending' | 'active' | 'suspended' | 'inactive' | 'withdrawn' | 'rejected';

const STATUS_CONFIG: Record<MemberStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: { label: 'Pending Approval', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: '⏳' },
  active: { label: 'Active', color: 'text-green-600', bgColor: 'bg-green-100', icon: '✅' },
  suspended: { label: 'Suspended', color: 'text-red-600', bgColor: 'bg-red-100', icon: '🚫' },
  inactive: { label: 'Inactive', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: '💤' },
  withdrawn: { label: 'Withdrawn', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: '📁' },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100', icon: '❌' },
};

const WORKFLOW_STAGES = [
  { key: 'registration', label: 'Registration', description: 'Member registered' },
  { key: 'documentation', label: 'Documentation', description: 'Uploading required documents' },
  { key: 'kyc_verification', label: 'KYC Verification', description: 'Identity verification in progress' },
  { key: 'compliance_review', label: 'Compliance Review', description: 'Admin reviewing compliance' },
  { key: 'approval', label: 'Pending Approval', description: 'Awaiting final approval' },
  { key: 'active', label: 'Active', description: 'Member fully active' },
];

type ProfileSection = 'overview' | 'documents' | 'compliance' | 'financial' | 'loans' | 'timeline' | 'kyc' | 'committees' | 'settings';
type ActionModal = 'edit_profile' | 'edit_contact' | 'savings_deposit' | 'savings_withdrawal' | 'contribution' | 'fine' | 
  'approve' | 'reject' | 'suspend' | 'reactivate' | 'archive' |
  'upload_document' | 'verify_document' | 'view_document' | 'edit_next_of_kin' | 'edit_emergency' | 'edit_employment' | 'edit_preferences' | null;

// ============================================
// MAIN COMPONENT
// ============================================

export default function MemberDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  
  // State
  const [member, setMember] = useState<Member | null>(null);
  const [balances, setBalances] = useState<CalculatedBalances | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategory[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<ProfileSection>('overview');
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Form states
  const [profileForm, setProfileForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', alt_phone: '', alt_email: '',
    id_number: '', kra_pin: '', date_of_birth: '', gender: '', marital_status: '', nationality: '',
    physical_address: '', postal_address: '', occupation: '', employer: '', employer_address: '',
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relationship: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
    preferred_language: 'en', preferred_contact_method: 'phone',
    sms_notifications: true, email_notifications: true,
    membership_category: '', member_group: '', admin_notes: '',
  });
  
  const [approvalForm, setApprovalForm] = useState({ comments: '' });
  const [verificationForm, setVerificationForm] = useState({ status: 'verified', notes: '' });
  const [transactionForm, setTransactionForm] = useState({
    amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (id) fetchAllData();
  }, [id]);

  const checkAdminAccess = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.success && ['super_admin', 'admin', 'staff'].includes(data.data?.user?.role)) {
        setIsAdmin(true);
      }
    } catch (err) {
      console.error('Failed to check admin access:', err);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchMember(), fetchDocuments(), fetchDocumentCategories(), fetchActivities()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMember = async () => {
    try {
      const res = await fetch(`/api/members/${id}`);
      const data = await res.json();
      if (data.success) {
        setMember(data.data.member);
        setBalances(data.data.balances);
        setTransactions(data.data.transactions || []);
        setLoans(data.data.loans || []);
        setFines(data.data.fines || []);
        setCommittees(data.data.committees || []);
        setProjects(data.data.projects || []);
        setStatusHistory(data.data.statusHistory || []);
        
        const m = data.data.member;
        setProfileForm({
          first_name: m.first_name || '', last_name: m.last_name || '', email: m.email || '', phone: m.phone || '',
          alt_phone: m.alt_phone || '', alt_email: m.alt_email || '', id_number: m.id_number || '', kra_pin: m.kra_pin || '',
          date_of_birth: m.date_of_birth || '', gender: m.gender || '', marital_status: m.marital_status || '',
          nationality: m.nationality || '', physical_address: m.physical_address || '', postal_address: m.postal_address || '',
          occupation: m.occupation || '', employer: m.employer || '', employer_address: m.employer_address || '',
          next_of_kin_name: m.next_of_kin_name || '', next_of_kin_phone: m.next_of_kin_phone || '',
          next_of_kin_relationship: m.next_of_kin_relationship || '',
          emergency_contact_name: m.emergency_contact_name || '', emergency_contact_phone: m.emergency_contact_phone || '',
          emergency_contact_relationship: m.emergency_contact_relationship || '',
          preferred_language: m.preferred_language || 'en', preferred_contact_method: m.preferred_contact_method || 'phone',
          sms_notifications: m.sms_notifications !== false, email_notifications: m.email_notifications !== false,
          membership_category: m.membership_category || '', member_group: m.member_group || '', admin_notes: m.admin_notes || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch member:', err);
      showMessage('error', 'Failed to load member data');
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/documents?memberId=${id}&module=members`);
      const data = await res.json();
      if (data.success) setDocuments(data.data.documents || []);
    } catch (err) { console.error('Failed to fetch documents:', err); }
  };

  const fetchDocumentCategories = async () => {
    try {
      const res = await fetch(`/api/documents?categories=true&module=members`);
      const data = await res.json();
      if (data.success) setDocumentCategories(data.data || []);
    } catch (err) { console.error('Failed to fetch document categories:', err); }
  };

  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/audit?record_id=${id}&limit=100`);
      const data = await res.json();
      if (data.success) setActivities(data.data || []);
      
      const txRes = await fetch(`/api/transactions?member_id=${id}&limit=50`);
      const txData = await txRes.json();
      if (txData.success) {
        const txActivities = (txData.data || []).map((t: Transaction) => ({
          id: t.id, action: t.transaction_type, description: `${t.transaction_type.replace(/_/g, ' ')} - ${formatCurrency(t.amount)}`,
          entity_type: 'transaction', entity_id: t.id, actor_name: 'System', created_at: t.created_at, old_value: null, new_value: null,
        }));
        setActivities(prev => [...prev, ...txActivities].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100));
      }
    } catch (err) { console.error('Failed to fetch activities:', err); }
  };

  // Utility functions
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
  const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
  const formatDateTime = (date: string) => new Date(date).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatFileSize = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return 'Unknown size';
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const showMessage = (type: 'success' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 5000); };
  const getStatusConfig = (status: string) => STATUS_CONFIG[status as MemberStatus] || STATUS_CONFIG.pending;
  const getDocumentStatusColor = (status: string) => {
    switch (status) {
      case 'verified': case 'approved': return 'text-green-600 bg-green-100';
      case 'pending': case 'submitted': return 'text-yellow-600 bg-yellow-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'expired': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };
  const getWorkflowStageIndex = (stage: string) => WORKFLOW_STAGES.findIndex(s => s.key === stage);
  const getComplianceStatus = () => {
    const required = documentCategories.filter(c => c.is_required);
    const uploaded = documents.filter(d => d.status === 'verified' || d.status === 'approved');
    const pending = documents.filter(d => d.status === 'pending' || d.status === 'submitted');
    const missing = required.filter(c => !documents.find(d => d.category_code === c.code));
    return { total: required.length, complete: uploaded.length, pending: pending.length, missing: missing.length, score: required.length > 0 ? Math.round((uploaded.length / required.length) * 100) : 0 };
  };

  // Action handlers
  const handleUpdateProfile = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Profile updated successfully'); setActionModal(null); fetchMember(); }
      else showMessage('error', data.error || 'Failed to update profile');
    } catch { showMessage('error', 'Failed to update profile'); } finally { setSubmitting(false); }
  };

  const handleApproveMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active', approval_comment: approvalForm.comments }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Member approved successfully'); setActionModal(null); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to approve member');
    } catch { showMessage('error', 'Failed to approve member'); } finally { setSubmitting(false); }
  };

  const handleRejectMember = async () => {
    if (!approvalForm.comments) { showMessage('error', 'Please provide a reason for rejection'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', rejection_comment: approvalForm.comments }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Member rejected'); setActionModal(null); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to reject member');
    } catch { showMessage('error', 'Failed to reject member'); } finally { setSubmitting(false); }
  };

  const handleSuspendMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'suspended', suspension_reason: approvalForm.comments }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Member suspended'); setActionModal(null); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to suspend member');
    } catch { showMessage('error', 'Failed to suspend member'); } finally { setSubmitting(false); }
  };

  const handleReactivateMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Member reactivated'); setActionModal(null); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to reactivate member');
    } catch { showMessage('error', 'Failed to reactivate member'); } finally { setSubmitting(false); }
  };

  const handleArchiveMember = async () => {
    if (!approvalForm.comments) { showMessage('error', 'Please provide a reason for archiving'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: approvalForm.comments }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Member archived'); setActionModal(null); router.push('/dashboard/members'); }
      else showMessage('error', data.error || 'Failed to archive member');
    } catch { showMessage('error', 'Failed to archive member'); } finally { setSubmitting(false); }
  };

  const handleVerifyDocument = async () => {
    if (!selectedDocument) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${selectedDocument.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: verificationForm.status, verification_notes: verificationForm.notes }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', `Document ${verificationForm.status}`); setActionModal(null); setSelectedDocument(null); fetchDocuments(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to verify document');
    } catch { showMessage('error', 'Failed to verify document'); } finally { setSubmitting(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !selectedCategory) return;
    const file = files[0];
    const maxSize = selectedCategory.max_file_size_mb * 1024 * 1024;
    if (file.size > maxSize) { showMessage('error', `File too large. Max: ${selectedCategory.max_file_size_mb}MB`); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('module', 'members');
      formData.append('entityType', 'member');
      formData.append('entityId', id);
      formData.append('categoryCode', selectedCategory.code);
      formData.append('documentName', file.name);
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Document uploaded successfully'); setActionModal(null); setSelectedCategory(null); fetchDocuments(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to upload document');
    } catch { showMessage('error', 'Failed to upload document'); } finally { setSubmitting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handlePostTransaction = async (type: 'deposit' | 'withdrawal' | 'contribution') => {
    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) { showMessage('error', 'Please enter a valid amount'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id, account_type: type === 'contribution' ? 'contributions' : 'savings',
          transaction_type: type === 'deposit' ? 'deposit' : type === 'withdrawal' ? 'withdrawal' : 'contribution',
          amount: parseFloat(transactionForm.amount), description: transactionForm.description || (type === 'contribution' ? 'Contribution' : type === 'deposit' ? 'Deposit' : 'Withdrawal'),
          reference_number: transactionForm.reference,
        }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', `${type.charAt(0).toUpperCase() + type.slice(1)} posted successfully`); setActionModal(null); setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Transaction failed');
    } catch { showMessage('error', 'Transaction failed'); } finally { setSubmitting(false); }
  };

  const handleIssueFine = async () => {
    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0 || !transactionForm.reason) { showMessage('error', 'Please enter amount and reason'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/fines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: member?.id, fine_type: transactionForm.fineType, amount: parseFloat(transactionForm.amount), reason: transactionForm.reason }),
      });
      const data = await res.json();
      if (data.success) { showMessage('success', 'Fine issued successfully'); setActionModal(null); setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); fetchMember(); fetchActivities(); }
      else showMessage('error', data.error || 'Failed to issue fine');
    } catch { showMessage('error', 'Failed to issue fine'); } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-500">Loading member profile...</p>
      </div>
    </div>
  );

  if (!member) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-500 text-lg">Member not found</p>
        <Link href="/dashboard/members" className="text-indigo-600 hover:underline mt-4 inline-block">Back to Members</Link>
      </div>
    </div>
  );

  const statusConfig = getStatusConfig(member.status);
  const complianceStatus = getComplianceStatus();
  const currentStageIndex = getWorkflowStageIndex(member.workflow_stage || 'registration');

  return (
    <div className="min-h-screen bg-gray-50">
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/members" className="text-gray-400 hover:text-gray-600 text-2xl">←</Link>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">
                  {member.first_name?.[0]}{member.last_name?.[0]}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">{member.first_name} {member.last_name}</h1>
                    <span className={`px-3 py-1 text-sm rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>{statusConfig.icon} {statusConfig.label}</span>
                  </div>
                  <p className="text-gray-500 text-sm">Member #{member.member_number} • Joined {formatDate(member.registration_date)}</p>
                </div>
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex items-center gap-2">
                {member.status === 'pending' && (
                  <>
                    <button onClick={() => { setApprovalForm({ comments: '' }); setActionModal('approve'); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">✓ Approve</button>
                    <button onClick={() => { setApprovalForm({ comments: '' }); setActionModal('reject'); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">✗ Reject</button>
                  </>
                )}
                {member.status === 'active' && (
                  <button onClick={() => { setApprovalForm({ comments: '' }); setActionModal('suspend'); }} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium">🚫 Suspend</button>
                )}
                {member.status === 'suspended' && (
                  <>
                    <button onClick={() => setActionModal('reactivate')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">✓ Reactivate</button>
                    <button onClick={() => { setApprovalForm({ comments: '' }); setActionModal('archive'); }} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium">📁 Archive</button>
                  </>
                )}
                <button onClick={() => setActionModal('edit_profile')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">✏️ Edit Profile</button>
              </div>
            )}
          </div>
        </div>
        
        {/* Workflow Progress */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {WORKFLOW_STAGES.map((stage, index) => (
              <div key={stage.key} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${index <= currentStageIndex ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                  <span>{index + 1}</span><span>{stage.label}</span>
                </div>
                {index < WORKFLOW_STAGES.length - 1 && <div className={`w-4 h-0.5 ${index < currentStageIndex ? 'bg-indigo-300' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview', icon: '👤' },
              { key: 'kyc', label: 'KYC & ID', icon: '🪪' },
              { key: 'documents', label: 'Documents', icon: '📄' },
              { key: 'compliance', label: 'Compliance', icon: '✅' },
              { key: 'financial', label: 'Financial', icon: '💰' },
              { key: 'loans', label: 'Loans', icon: '🏦' },
              { key: 'committees', label: 'Committees', icon: '👥' },
              { key: 'timeline', label: 'Timeline', icon: '📋' },
              { key: 'settings', label: 'Settings', icon: '⚙️' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setSection(tab.key as ProfileSection)}
                className={`py-3 px-3 border-b-2 text-sm font-medium whitespace-nowrap ${section === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* OVERVIEW SECTION */}
        {section === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
                  {isAdmin && <button onClick={() => setActionModal('edit_profile')} className="text-indigo-600 hover:text-indigo-800 text-sm">Edit</button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InfoCard label="Full Name" value={`${member.first_name} ${member.last_name}`} />
                  <InfoCard label="Email" value={member.email || 'Not provided'} />
                  <InfoCard label="Phone" value={member.phone} />
                  <InfoCard label="Date of Birth" value={formatDate(member.date_of_birth)} />
                  <InfoCard label="Gender" value={member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : 'Not specified'} />
                  <InfoCard label="Nationality" value={member.nationality || 'Not specified'} />
                  <InfoCard label="Marital Status" value={member.marital_status || 'Not specified'} />
                  <InfoCard label="ID Number" value={member.id_number || 'Not provided'} />
                  <InfoCard label="KRA PIN" value={member.kra_pin || 'Not provided'} />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
                  {isAdmin && <button onClick={() => setActionModal('edit_contact')} className="text-indigo-600 hover:text-indigo-800 text-sm">Edit</button>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InfoCard label="Physical Address" value={member.physical_address || 'Not provided'} />
                  <InfoCard label="Postal Address" value={member.postal_address || 'Not provided'} />
                  <InfoCard label="Alt. Phone" value={member.alt_phone || 'Not provided'} />
                  <InfoCard label="Alt. Email" value={member.alt_email || 'Not provided'} />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Employment Information</h2>
                  {isAdmin && <button onClick={() => setActionModal('edit_employment')} className="text-indigo-600 hover:text-indigo-800 text-sm">Edit</button>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InfoCard label="Occupation" value={member.occupation || 'Not specified'} />
                  <InfoCard label="Employer" value={member.employer || 'Not specified'} />
                  <div className="col-span-2"><InfoCard label="Employer Address" value={member.employer_address || 'Not specified'} /></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Next of Kin</h2>
                    {isAdmin && <button onClick={() => setActionModal('edit_next_of_kin')} className="text-indigo-600 hover:text-indigo-800 text-sm">Edit</button>}
                  </div>
                  <div className="space-y-3">
                    <InfoCard label="Name" value={member.next_of_kin_name || 'Not provided'} />
                    <InfoCard label="Phone" value={member.next_of_kin_phone || 'Not provided'} />
                    <InfoCard label="Relationship" value={member.next_of_kin_relationship || 'Not specified'} />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Emergency Contact</h2>
                    {isAdmin && <button onClick={() => setActionModal('edit_emergency')} className="text-indigo-600 hover:text-indigo-800 text-sm">Edit</button>}
                  </div>
                  <div className="space-y-3">
                    <InfoCard label="Name" value={member.emergency_contact_name || 'Not provided'} />
                    <InfoCard label="Phone" value={member.emergency_contact_phone || 'Not provided'} />
                    <InfoCard label="Relationship" value={member.emergency_contact_relationship || 'Not specified'} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Status</h2>
                <div className="flex items-center justify-center mb-4">
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="#E5E7EB" strokeWidth="12" fill="none" />
                      <circle cx="64" cy="64" r="56" stroke={complianceStatus.score === 100 ? '#10B981' : complianceStatus.score >= 50 ? '#F59E0B' : '#EF4444'} strokeWidth="12" fill="none" strokeDasharray={`${complianceStatus.score * 3.52} 352`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-gray-900">{complianceStatus.score}%</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Complete</span><span className="font-medium text-green-600">{complianceStatus.complete} required</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Pending</span><span className="font-medium text-yellow-600">{complianceStatus.pending}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Missing</span><span className="font-medium text-red-600">{complianceStatus.missing}</span></div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center"><span className="text-gray-600">Savings</span><span className="font-semibold text-lg text-green-600">{formatCurrency(balances?.savings || 0)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Contributions</span><span className="font-semibold text-lg">{formatCurrency(balances?.contributions || 0)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Welfare</span><span className="font-semibold text-lg">{formatCurrency(balances?.welfare || 0)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Outstanding Fines</span><span className={`font-semibold text-lg ${(balances?.fines || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(balances?.fines || 0)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Active Loans</span><span className="font-semibold text-lg">{loans.length}</span></div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Membership</h2>
                <div className="space-y-3 text-sm">
                  <InfoCard label="Category" value={member.membership_category || 'Standard'} />
                  <InfoCard label="Group" value={member.member_group || 'Default'} />
                  <InfoCard label="Joined" value={formatDate(member.registration_date)} />
                  {member.approved_at && <InfoCard label="Approved" value={formatDateTime(member.approved_at)} />}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KYC SECTION */}
        {section === 'kyc' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Identity Verification (KYC)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-gray-900">National Identification</h3>
                    {documents.find(d => d.category_code === 'member_national_id')?.status === 'verified' ? <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">Verified</span> : <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">Pending</span>}
                  </div>
                  <InfoCard label="ID Number" value={member.id_number || 'Not provided'} />
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-gray-900">KRA PIN Certificate</h3>
                    {documents.find(d => d.category_code === 'member_kra_pin')?.status === 'verified' ? <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">Verified</span> : <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">Pending</span>}
                  </div>
                  <InfoCard label="KRA PIN" value={member.kra_pin || 'Not provided'} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENTS SECTION */}
        {section === 'documents' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Member Documents</h2>
                  <p className="text-sm text-gray-500">{documents.length} documents uploaded</p>
                </div>
                {isAdmin && (
                  <div className="relative inline-block">
                    <select 
                      onChange={(e) => {
                        const category = documentCategories.find(c => c.code === e.target.value);
                        if (category) {
                          setSelectedCategory(category);
                          setActionModal('upload_document');
                        }
                        e.target.value = '';
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm cursor-pointer appearance-none pr-8"
                      defaultValue=""
                    >
                      <option value="" disabled>+ Upload Document</option>
                      {documentCategories.map(cat => (
                        <option key={cat.code} value={cat.code}>
                          {cat.name} {cat.is_required ? '(Required)' : '(Optional)'}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white pointer-events-none">▼</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map(doc => (
                  <div key={doc.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center"><span className="text-lg">📄</span></div>
                        <div>
                          <h3 className="font-medium text-gray-900">{doc.category_name || 'Document'}</h3>
                          <p className="text-xs text-gray-500">{formatFileSize(doc.file_size)}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${getDocumentStatusColor(doc.status)}`}>{doc.status}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3 truncate">{doc.document_name || 'Document'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedDocument(doc); setActionModal('view_document'); }} className="text-xs text-blue-600 hover:text-blue-800">View</button>
                        {isAdmin && doc.status !== 'verified' && (
                          <button onClick={() => { setSelectedDocument(doc); setVerificationForm({ status: 'verified', notes: '' }); setActionModal('verify_document'); }} className="text-xs text-indigo-600 hover:text-indigo-800">Verify</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {documents.length === 0 && <p className="text-gray-500 text-sm col-span-3 text-center py-8">No documents uploaded</p>}
              </div>
            </div>
          </div>
        )}

        {/* COMPLIANCE SECTION */}
        {section === 'compliance' && (
          <div className="space-y-6">
            {/* Compliance Requirements from compliance_records */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Compliance Requirements</h2>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (confirm('Mark all requirements as complete?')) {
                        fetch(`/api/compliance`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ memberId: id, action: 'batch_update', status: 'complete', notes: 'Marked complete by admin' })
                        }).then(() => fetchMember());
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Mark All Complete
                  </button>
                )}
              </div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Compliance</span>
                  <span className="text-sm text-gray-600">{complianceStatus.score}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className={`h-3 rounded-full transition-all ${complianceStatus.score === 100 ? 'bg-green-500' : complianceStatus.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${complianceStatus.score}%` }} />
                </div>
              </div>
              <div className="space-y-3">
                {documentCategories.filter(c => c.is_required).map(category => {
                  const doc = documents.find(d => d.category_code === category.code);
                  const isComplete = doc?.status === 'verified' || doc?.status === 'approved';
                  return (
                    <div key={category.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {isComplete ? (
                          <span className="text-green-500 text-xl">✓</span>
                        ) : doc ? (
                          <span className="text-yellow-500 text-xl">⏳</span>
                        ) : (
                          <span className="text-red-500 text-xl">✗</span>
                        )}
                        <div>
                          <h3 className="font-medium text-gray-900">{category.name}</h3>
                          <p className="text-xs text-gray-500">{doc ? `${doc.document_name || 'Document'} • Uploaded ${formatDate(doc.created_at)}` : 'Not uploaded'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {doc && <span className={`px-3 py-1 text-xs rounded-full ${getDocumentStatusColor(doc.status)}`}>{doc.status}</span>}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setSelectedCategory(category);
                              setActionModal('upload_document');
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-800"
                          >
                            {doc ? 'Replace' : 'Upload'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Compliance Actions - Link requirements to documents */}
            {isAdmin && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Manual Compliance Actions</h2>
                <p className="text-sm text-gray-500 mb-4">Use these to manually mark requirements as complete when documents have been verified manually.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      if (confirm('Mark all requirements as COMPLETE?')) {
                        const res = await fetch(`/api/compliance`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ memberId: id, action: 'batch_update', status: 'complete', notes: 'Manually marked complete' })
                        });
                        if (res.ok) {
                          alert('All requirements marked as complete!');
                          fetchMember();
                        }
                      }
                    }}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                  >
                    ✓ Mark All Complete
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Mark all requirements as PENDING?')) {
                        const res = await fetch(`/api/compliance`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ memberId: id, action: 'batch_update', status: 'pending', notes: 'Reset to pending' })
                        });
                        if (res.ok) {
                          alert('All requirements marked as pending!');
                          fetchMember();
                        }
                      }
                    }}
                    className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 text-sm font-medium"
                  >
                    ⏳ Mark All Pending
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Mark all requirements as MISSING?')) {
                        const res = await fetch(`/api/compliance`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ memberId: id, action: 'batch_update', status: 'missing', notes: 'Marked as missing' })
                        });
                        if (res.ok) {
                          alert('All requirements marked as missing!');
                          fetchMember();
                        }
                      }
                    }}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                  >
                    ✗ Mark All Missing
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FINANCIAL SECTION */}
        {section === 'financial' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Account Balances</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <BalanceCard title="Savings" amount={balances?.savings || 0} color="green" />
                  <BalanceCard title="Contributions" amount={balances?.contributions || 0} color="blue" />
                  <BalanceCard title="Welfare" amount={balances?.welfare || 0} color="purple" />
                  <BalanceCard title="Outstanding Fines" amount={balances?.fines || 0} color="red" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Transactions</h2>
                <div className="space-y-3">
                  {transactions.slice(0, 10).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div>
                        <p className="font-medium text-gray-900">{tx.transaction_type.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-500">{tx.description || 'No description'}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${tx.transaction_type.includes('withdrawal') ? 'text-red-600' : 'text-green-600'}`}>{tx.transaction_type.includes('withdrawal') ? '-' : '+'}{formatCurrency(tx.amount)}</p>
                        <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No transactions</p>}
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="space-y-3">
                  <button onClick={() => { setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); setActionModal('savings_deposit'); }} className="w-full px-4 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-left font-medium">💰 Savings Deposit</button>
                  <button onClick={() => { setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); setActionModal('savings_withdrawal'); }} className="w-full px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-left font-medium">💸 Savings Withdrawal</button>
                  <button onClick={() => { setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); setActionModal('contribution'); }} className="w-full px-4 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-left font-medium">🎯 Record Contribution</button>
                  <button onClick={() => { setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); setActionModal('fine'); }} className="w-full px-4 py-3 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 text-left font-medium">⚠️ Issue Fine</button>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Outstanding Fines</h2>
                <div className="space-y-3">
                  {fines.map(fine => (
                    <div key={fine.id} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm">{fine.fine_type.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${fine.status === 'paid' ? 'bg-green-100 text-green-600' : fine.status === 'partial' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>{fine.status}</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{fine.reason}</p>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Amount</span><span className="font-medium">{formatCurrency(fine.amount)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Paid</span><span className="font-medium">{formatCurrency(fine.paid_amount)}</span></div>
                    </div>
                  ))}
                  {fines.length === 0 && <p className="text-gray-500 text-sm text-center">No outstanding fines</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LOANS SECTION */}
        {section === 'loans' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Member Loans</h2>
                <Link href={`/dashboard/loans?member_id=${id}`} className="text-indigo-600 hover:text-indigo-800 text-sm">View All →</Link>
              </div>
              <div className="space-y-4">
                {loans.map(loan => (
                  <div key={loan.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{loan.loan_type}</h3>
                        <p className="text-sm text-gray-500">Applied: {formatDate(loan.application_date)}</p>
                      </div>
                      <span className={`px-3 py-1 text-sm rounded-full ${loan.status === 'active' ? 'bg-green-100 text-green-600' : loan.status === 'pending' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>{loan.status}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div><span className="text-gray-500">Principal</span><p className="font-medium">{formatCurrency(loan.principal_amount)}</p></div>
                      <div><span className="text-gray-500">Interest</span><p className="font-medium">{loan.interest_rate}%</p></div>
                      <div><span className="text-gray-500">Outstanding</span><p className="font-medium text-red-600">{formatCurrency(loan.outstanding_balance)}</p></div>
                      <div><span className="text-gray-500">Due Date</span><p className="font-medium">{formatDate(loan.due_date)}</p></div>
                    </div>
                  </div>
                ))}
                {loans.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No active loans</p>}
              </div>
            </div>
          </div>
        )}

        {/* COMMITTEES SECTION */}
        {section === 'committees' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Committee Assignments</h2>
                <div className="space-y-4">
                  {committees.map(committee => (
                    <div key={committee.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium text-gray-900">{committee.committee_name}</h3>
                        <p className="text-sm text-gray-500">{committee.role && <span>Role: {committee.role} • </span>}{committee.start_date && `Since ${formatDate(committee.start_date)}`}</p>
                      </div>
                      <span className={`px-3 py-1 text-xs rounded-full ${committee.end_date ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'}`}>{committee.end_date ? 'Past' : 'Active'}</span>
                    </div>
                  ))}
                  {committees.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No committee assignments</p>}
                </div>
              </div>
            </div>
            <div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Project Participation</h2>
                <div className="space-y-4">
                  {projects.map(project => (
                    <div key={project.id} className="p-4 border rounded-lg">
                      <h3 className="font-medium text-gray-900">{project.project_name}</h3>
                      <p className="text-sm text-gray-500 mb-2">{project.role && <span>Role: {project.role} • </span>}{project.status}</p>
                    </div>
                  ))}
                  {projects.length === 0 && <p className="text-gray-500 text-sm text-center">No project participation</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TIMELINE SECTION */}
        {section === 'timeline' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Activity Timeline</h2>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                <div className="space-y-6">
                  {activities.map((activity, i) => (
                    <div key={activity.id || i} className="relative flex gap-4 pl-10">
                      <div className={`absolute left-2 w-4 h-4 rounded-full border-2 border-white ${activity.action?.includes('status') ? 'bg-yellow-500' : activity.action?.includes('update') ? 'bg-blue-500' : activity.action?.includes('document') ? 'bg-purple-500' : activity.action?.includes('transaction') ? 'bg-green-500' : 'bg-indigo-500'}`} />
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{activity.description}</p>
                            <p className="text-sm text-gray-500">{activity.actor_name || 'System'}</p>
                          </div>
                          <span className="text-sm text-gray-400 whitespace-nowrap">{formatDateTime(activity.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No activity recorded</p>}
                </div>
              </div>
            </div>
            {statusHistory.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Status History</h2>
                <div className="space-y-4">
                  {statusHistory.map(history => (
                    <div key={history.id} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">{getStatusConfig(history.new_status).icon}</div>
                      <div className="flex-1">
                        <p className="font-medium">{history.previous_status && `${getStatusConfig(history.previous_status).label} → `}{getStatusConfig(history.new_status).label}</p>
                        {history.reason && <p className="text-sm text-gray-500">{history.reason}</p>}
                      </div>
                      <span className="text-sm text-gray-400">{formatDateTime(history.changed_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS SECTION */}
        {section === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Communication Preferences</h2>
                {isAdmin && <button onClick={() => setActionModal('edit_preferences')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">Edit Preferences</button>}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div><p className="font-medium">Email Notifications</p><p className="text-sm text-gray-500">Receive updates via email</p></div>
                    <span className={`px-3 py-1 text-sm rounded-full ${member.email_notifications ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>{member.email_notifications ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div><p className="font-medium">SMS Notifications</p><p className="text-sm text-gray-500">Receive updates via SMS</p></div>
                    <span className={`px-3 py-1 text-sm rounded-full ${member.sms_notifications ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>{member.sms_notifications ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <InfoCard label="Preferred Language" value={member.preferred_language || 'English'} />
                  <InfoCard label="Preferred Contact" value={member.preferred_contact_method || 'Phone'} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Membership Settings</h2>
              <div className="grid grid-cols-2 gap-6">
                <InfoCard label="Membership Category" value={member.membership_category || 'Standard'} />
                <InfoCard label="Member Group" value={member.member_group || 'Default'} />
              </div>
            </div>
            {isAdmin && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Notes</h2>
                <textarea value={profileForm.admin_notes} onChange={(e) => setProfileForm({ ...profileForm, admin_notes: e.target.value })} onBlur={handleUpdateProfile} placeholder="Add administrative notes about this member..." rows={4} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALS */}
      {actionModal === 'edit_profile' && (
        <Modal title="Edit Profile" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name</label><input type="text" value={profileForm.first_name} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label><input type="text" value={profileForm.last_name} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label><input type="date" value={profileForm.date_of_birth} onChange={(e) => setProfileForm({ ...profileForm, date_of_birth: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Gender</label><select value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label><input type="text" value={profileForm.nationality} onChange={(e) => setProfileForm({ ...profileForm, nationality: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Marital Status</label><select value={profileForm.marital_status} onChange={(e) => setProfileForm({ ...profileForm, marital_status: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="">Select</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label><input type="text" value={profileForm.id_number} onChange={(e) => setProfileForm({ ...profileForm, id_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">KRA PIN</label><input type="text" value={profileForm.kra_pin} onChange={(e) => setProfileForm({ ...profileForm, kra_pin: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            </div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleUpdateProfile} disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save Changes'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'edit_contact' && (
        <Modal title="Edit Contact Information" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Email</label><input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Phone</label><input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Alt. Phone</label><input type="tel" value={profileForm.alt_phone} onChange={(e) => setProfileForm({ ...profileForm, alt_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Alt. Email</label><input type="email" value={profileForm.alt_email} onChange={(e) => setProfileForm({ ...profileForm, alt_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Physical Address</label><textarea value={profileForm.physical_address} onChange={(e) => setProfileForm({ ...profileForm, physical_address: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Postal Address</label><textarea value={profileForm.postal_address} onChange={(e) => setProfileForm({ ...profileForm, postal_address: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleUpdateProfile} disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save Changes'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'approve' && (
        <Modal title="Approve Member" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <p className="text-gray-600">This will activate the member's account and grant them full access to all services.</p>
            {complianceStatus.score < 100 && <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200"><p className="text-yellow-800 text-sm">⚠️ Warning: Compliance is at {complianceStatus.score}%. Consider completing required documents before approval.</p></div>}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Approval Comments (Optional)</label><textarea value={approvalForm.comments} onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })} placeholder="Add any comments about this approval..." rows={3} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleApproveMember} disabled={submitting} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Confirm Approval'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'reject' && (
        <Modal title="Reject Member" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <p className="text-gray-600">This will reject the member application. Please provide a reason.</p>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label><textarea value={approvalForm.comments} onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })} placeholder="Explain why this member is being rejected..." rows={4} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleRejectMember} disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Confirm Rejection'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'suspend' && (
        <Modal title="Suspend Member" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <p className="text-gray-600">This will temporarily suspend the member's access to all services.</p>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason for Suspension *</label><textarea value={approvalForm.comments} onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })} placeholder="Explain why this member is being suspended..." rows={3} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleSuspendMember} disabled={submitting} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Confirm Suspension'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'archive' && (
        <Modal title="Archive Member" onClose={() => setActionModal(null)}>
          <div className="space-y-4">
            <p className="text-gray-600">This will archive the member. Archived members cannot access services.</p>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason for Archiving *</label><textarea value={approvalForm.comments} onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })} placeholder="Explain why this member is being archived..." rows={3} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleArchiveMember} disabled={submitting} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Archive Member'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'reactivate' && (
        <Modal title="Reactivate Member" onClose={() => setActionModal(null)}>
          <p className="text-gray-600">This will restore the member's full access to all services.</p>
          <ModalActions><button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleReactivateMember} disabled={submitting} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Reactivate Member'}</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'upload_document' && selectedCategory && (
        <Modal title={`Upload ${selectedCategory.name}`} onClose={() => { setActionModal(null); setSelectedCategory(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{selectedCategory.is_required ? 'Required document' : 'Optional document'}</p>
            <div><label className="block text-sm font-medium text-gray-700 mb-2">Select File</label><input ref={fileInputRef} type="file" accept={selectedCategory.allowed_mime_types?.join(',')} onChange={handleFileUpload} className="w-full px-3 py-2 border rounded-lg" /><p className="text-xs text-gray-500 mt-1">Max size: {selectedCategory.max_file_size_mb}MB</p></div>
          </div>
          <ModalActions><button onClick={() => { setActionModal(null); setSelectedCategory(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button></ModalActions>
        </Modal>
      )}

      {actionModal === 'verify_document' && selectedDocument && (
        <Modal title="Verify Document" onClose={() => { setActionModal(null); setSelectedDocument(null); }}>
          <>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{selectedDocument.category_name}</p>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Verification Status</label><select value={verificationForm.status} onChange={(e) => setVerificationForm({ ...verificationForm, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="verified">Verified</option><option value="rejected">Rejected</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={verificationForm.notes} onChange={(e) => setVerificationForm({ ...verificationForm, notes: e.target.value })} placeholder="Add verification notes..." rows={3} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
            </div>
            <ModalActions><button onClick={() => { setActionModal(null); setSelectedDocument(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleVerifyDocument} disabled={submitting} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Confirm'}</button></ModalActions>
          </>
        </Modal>
      )}

      {actionModal === 'view_document' && selectedDocument && (
        <Modal title="View Document" onClose={() => { setActionModal(null); setSelectedDocument(null); }} className="max-w-4xl">
          <>
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-gray-700">{selectedDocument.document_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Size: {formatFileSize(selectedDocument.file_size)} |
                  Type: {selectedDocument.mime_type} |
                  Uploaded: {formatDate(selectedDocument.created_at)}
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden bg-gray-100 min-h-[400px] flex items-center justify-center">
                {selectedDocument.mime_type?.startsWith('image/') ? (
                  <img
                    src={selectedDocument.file_url}
                    alt={selectedDocument.document_name}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                ) : selectedDocument.mime_type?.includes('pdf') ? (
                  <iframe
                    src={selectedDocument.file_url}
                    className="w-full h-[60vh]"
                    title="Document Preview"
                  />
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500 mb-4">Preview not available for this file type</p>
                    <a
                      href={selectedDocument.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Download to View
                    </a>
                  </div>
                )}
              </div>
            </div>
            <ModalActions>
              <button onClick={() => { setActionModal(null); setSelectedDocument(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
              {isAdmin && selectedDocument.status !== 'verified' && (
                <button onClick={() => { setVerificationForm({ status: 'verified', notes: '' }); setActionModal('verify_document'); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Verify Document</button>
              )}
            </ModalActions>
          </>
        </Modal>
      )}


      {(actionModal === 'savings_deposit' || actionModal === 'savings_withdrawal' || actionModal === 'contribution') && (
        <TransactionModal
          title={actionModal === 'savings_deposit' ? 'Savings Deposit' : actionModal === 'savings_withdrawal' ? 'Savings Withdrawal' : 'Record Contribution'}
          onClose={() => setActionModal(null)}
          onSubmit={() => handlePostTransaction(actionModal === 'savings_deposit' ? 'deposit' : actionModal === 'savings_withdrawal' ? 'withdrawal' : 'contribution')}
          transactionForm={transactionForm} setTransactionForm={setTransactionForm} submitting={submitting} showFineType={false}
        />
      )}

      {actionModal === 'fine' && (
        <TransactionModal title="Issue Fine" onClose={() => setActionModal(null)} onSubmit={handleIssueFine} transactionForm={transactionForm} setTransactionForm={setTransactionForm} submitting={submitting} showFineType={true} />
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-medium text-gray-900">{value || '—'}</p>
    </div>
  );
}

function BalanceCard({ title, amount, color }: { title: string; amount: number; color: string }) {
  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amt);
  const colorClasses: Record<string, { bg: string; text: string }> = {
    green: { bg: 'bg-green-50', text: 'text-green-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
    red: { bg: 'bg-red-50', text: 'text-red-700' },
  };
  return (
    <div className={`p-4 rounded-xl ${colorClasses[color]?.bg || 'bg-gray-50'}`}>
      <p className={`text-sm font-medium ${colorClasses[color]?.text || 'text-gray-700'}`}>{title}</p>
      <p className={`text-xl font-bold mt-1 ${colorClasses[color]?.text || 'text-gray-900'}`}>{formatCurrency(amount)}</p>
    </div>
  );
}

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto ${className || 'max-w-lg'}`}>
        <div className="p-6 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="p-6 border-t flex justify-end gap-3 mt-4">{children}</div>;
}

function TransactionModal({ title, onClose, onSubmit, transactionForm, setTransactionForm, submitting, showFineType }: {
  title: string; onClose: () => void; onSubmit: () => void; transactionForm: any; setTransactionForm: (f: any) => void; submitting: boolean; showFineType: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {showFineType && (
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Fine Type</label><select value={transactionForm.fineType} onChange={(e) => setTransactionForm({ ...transactionForm, fineType: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"><option value="meeting_absence">Meeting Absence</option><option value="late_payment">Late Payment</option><option value="penalty">Penalty</option><option value="manual">Manual</option></select></div>
        )}
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label><input type="number" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">{showFineType ? 'Reason' : 'Description'}</label><textarea value={showFineType ? transactionForm.reason : transactionForm.description} onChange={(e) => setTransactionForm({ ...transactionForm, [showFineType ? 'reason' : 'description']: e.target.value })} placeholder={showFineType ? 'Enter fine reason...' : 'Optional description...'} rows={2} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label><input type="text" value={transactionForm.reference} onChange={(e) => setTransactionForm({ ...transactionForm, reference: e.target.value })} placeholder="Optional reference..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
      </div>
      <ModalActions><button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button><button onClick={onSubmit} disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Processing...' : 'Submit'}</button></ModalActions>
    </Modal>
  );
}
