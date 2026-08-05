'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  id_number: string | null;
  status: string;
  registration_date: string;
  occupation: string | null;
  employer: string | null;
  physical_address: string | null;
  postal_address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
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
  old_value: string | null;
  new_value: string | null;
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

// ============================================
// LIFECYCLE STAGES
// ============================================

type MemberStatus = 'pending' | 'active' | 'suspended' | 'inactive' | 'withdrawn' | 'rejected';

const STATUS_CONFIG: Record<MemberStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending Approval', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  active: { label: 'Active', color: 'text-green-600', bgColor: 'bg-green-100' },
  suspended: { label: 'Suspended', color: 'text-red-600', bgColor: 'bg-red-100' },
  inactive: { label: 'Inactive', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  withdrawn: { label: 'Withdrawn', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100' },
};

type ProfileSection = 'overview' | 'documents' | 'financial' | 'loans' | 'timeline' | 'compliance';
type ActionModal = 'edit_profile' | 'edit_contact' | 'savings_deposit' | 'savings_withdrawal' | 'contribution' | 'fine' | 'approve' | 'reject' | 'suspend' | 'reactivate' | 'upload_document' | 'verify_document' | null;

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
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    id_number: '',
    date_of_birth: '',
    gender: '',
    occupation: '',
    employer: '',
    physical_address: '',
    postal_address: '',
  });
  
  const [contactForm, setContactForm] = useState({
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_relationship: '',
  });
  
  const [transactionForm, setTransactionForm] = useState({
    amount: '',
    description: '',
    reference: '',
    fineType: 'meeting_absence',
    reason: '',
  });
  
  const [approvalForm, setApprovalForm] = useState({
    comments: '',
  });
  
  const [verificationForm, setVerificationForm] = useState({
    status: 'verified',
    notes: '',
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Check admin access
  useEffect(() => {
    checkAdminAccess();
  }, []);

  // Fetch data
  useEffect(() => {
    if (id) {
      fetchAllData();
    }
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
      await Promise.all([
        fetchMember(),
        fetchDocuments(),
        fetchDocumentCategories(),
        fetchActivities(),
      ]);
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
        
        // Initialize forms
        const m = data.data.member;
        setProfileForm({
          first_name: m.first_name || '',
          last_name: m.last_name || '',
          email: m.email || '',
          phone: m.phone || '',
          id_number: m.id_number || '',
          date_of_birth: m.date_of_birth || '',
          gender: m.gender || '',
          occupation: m.occupation || '',
          employer: m.employer || '',
          physical_address: m.physical_address || '',
          postal_address: m.postal_address || '',
        });
        setContactForm({
          next_of_kin_name: m.next_of_kin_name || '',
          next_of_kin_phone: m.next_of_kin_phone || '',
          next_of_kin_relationship: m.next_of_kin_relationship || '',
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
      if (data.success) {
        setDocuments(data.data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchDocumentCategories = async () => {
    try {
      const res = await fetch(`/api/documents?categories=true&module=members`);
      const data = await res.json();
      if (data.success) {
        setDocumentCategories(data.data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch document categories:', err);
    }
  };

  const fetchActivities = async () => {
    try {
      // Fetch audit logs for this member
      const res = await fetch(`/api/audit?record_id=${id}&limit=50`);
      const data = await res.json();
      if (data.success) {
        setActivities(data.data || []);
      }
      
      // Also fetch transactions as activities
      const txRes = await fetch(`/api/transactions?member_id=${id}&limit=20`);
      const txData = await txRes.json();
      if (txData.success) {
        const txActivities = (txData.data || []).map((t: Transaction) => ({
          id: t.id,
          action: t.transaction_type,
          description: `${t.transaction_type.replace(/_/g, ' ')} - ${formatCurrency(t.amount)}`,
          entity_type: 'transaction',
          entity_id: t.id,
          actor_name: 'System',
          created_at: t.created_at,
          old_value: null,
          new_value: null,
        }));
        setActivities(prev => [...prev, ...txActivities].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ).slice(0, 50));
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    }
  };

  // Utility functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as MemberStatus] || STATUS_CONFIG.pending;
  };

  const getDocumentStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'expired': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Document category helpers
  const getComplianceStatus = () => {
    const required = documentCategories.filter(c => c.is_required);
    const uploaded = documents.filter(d => d.status === 'verified');
    const missing = required.filter(c => !uploaded.find(d => d.document_type === c.code));
    
    return {
      total: required.length,
      complete: uploaded.length,
      missing: missing.length,
      missingCategories: missing,
    };
  };

  // ============================================
  // ACTION HANDLERS
  // ============================================

  const handleUpdateProfile = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Profile updated successfully');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to update profile');
      }
    } catch {
      showMessage('error', 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateContact = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Contact information updated');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to update contact');
      }
    } catch {
      showMessage('error', 'Failed to update contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostTransaction = async () => {
    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      showMessage('error', 'Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const transactionType = actionModal === 'savings_deposit' ? 'deposit' : 'withdrawal';
      const accountType = 'savings';

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          account_type: accountType,
          transaction_type: transactionType,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          reference_number: transactionForm.reference,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showMessage('success', `${actionModal === 'savings_deposit' ? 'Deposit' : 'Withdrawal'} posted successfully`);
        setActionModal(null);
        setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        showMessage('error', data.error || 'Transaction failed');
      }
    } catch {
      showMessage('error', 'Transaction failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostContribution = async () => {
    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      showMessage('error', 'Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          account_type: 'contributions',
          transaction_type: 'contribution',
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description || 'Contribution',
          reference_number: transactionForm.reference,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showMessage('success', 'Contribution posted successfully');
        setActionModal(null);
        setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        showMessage('error', data.error || 'Transaction failed');
      }
    } catch {
      showMessage('error', 'Transaction failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueFine = async () => {
    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0 || !transactionForm.reason) {
      showMessage('error', 'Please enter amount and reason');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member?.id,
          fine_type: transactionForm.fineType,
          amount: parseFloat(transactionForm.amount),
          reason: transactionForm.reason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showMessage('success', 'Fine issued successfully');
        setActionModal(null);
        setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' });
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to issue fine');
      }
    } catch {
      showMessage('error', 'Failed to issue fine');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          approval_comment: approvalForm.comments,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Member approved successfully');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to approve member');
      }
    } catch {
      showMessage('error', 'Failed to approve member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectMember = async () => {
    if (!approvalForm.comments) {
      showMessage('error', 'Please provide a reason for rejection');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejection_comment: approvalForm.comments,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Member rejected');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to reject member');
      }
    } catch {
      showMessage('error', 'Failed to reject member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspendMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'suspended',
          suspension_reason: approvalForm.comments,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Member suspended');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to suspend member');
      }
    } catch {
      showMessage('error', 'Failed to suspend member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReactivateMember = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Member reactivated');
        setActionModal(null);
        fetchMember();
      } else {
        showMessage('error', data.error || 'Failed to reactivate member');
      }
    } catch {
      showMessage('error', 'Failed to reactivate member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyDocument = async () => {
    if (!selectedDocument) return;
    
    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${selectedDocument.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: verificationForm.status,
          verification_notes: verificationForm.notes,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', `Document ${verificationForm.status}`);
        setActionModal(null);
        setSelectedDocument(null);
        fetchDocuments();
      } else {
        showMessage('error', data.error || 'Failed to verify document');
      }
    } catch {
      showMessage('error', 'Failed to verify document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length || !selectedCategory) return;

    const file = files[0];
    
    // Validate file size
    const maxSize = selectedCategory.max_file_size_mb * 1024 * 1024;
    if (file.size > maxSize) {
      showMessage('error', `File too large. Maximum size is ${selectedCategory.max_file_size_mb}MB`);
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('memberId', id);
      formData.append('module', 'members');
      formData.append('categoryCode', selectedCategory.code);
      formData.append('documentName', file.name);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Document uploaded successfully');
        setActionModal(null);
        setSelectedCategory(null);
        fetchDocuments();
      } else {
        showMessage('error', data.error || 'Failed to upload document');
      }
    } catch {
      showMessage('error', 'Failed to upload document');
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        showMessage('success', 'Document deleted');
        fetchDocuments();
      } else {
        showMessage('error', data.error || 'Failed to delete document');
      }
    } catch {
      showMessage('error', 'Failed to delete document');
    }
  };

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading member profile...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-lg">Member not found</p>
          <Link href="/dashboard/members" className="text-indigo-600 hover:underline mt-4 inline-block">
            Back to Members
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(member.status);
  const complianceStatus = getComplianceStatus();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/members" className="text-gray-400 hover:text-gray-600">
                ←
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {member.first_name} {member.last_name}
                  </h1>
                  <span className={`px-3 py-1 text-sm rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <p className="text-gray-500 text-sm">
                  Member #{member.member_number} • Joined {formatDate(member.registration_date)}
                </p>
              </div>
            </div>
            
            {/* Quick Actions */}
            {isAdmin && (
              <div className="flex items-center gap-2">
                {member.status === 'pending' && (
                  <>
                    <button
                      onClick={() => { setApprovalForm({ comments: '' }); setActionModal('approve'); }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setApprovalForm({ comments: '' }); setActionModal('reject'); }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                    >
                      Reject
                    </button>
                  </>
                )}
                {member.status === 'active' && (
                  <button
                    onClick={() => { setApprovalForm({ comments: '' }); setActionModal('suspend'); }}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                  >
                    Suspend
                  </button>
                )}
                {member.status === 'suspended' && (
                  <button
                    onClick={() => setActionModal('reactivate')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview', icon: '👤' },
              { key: 'documents', label: 'Documents', icon: '📄' },
              { key: 'compliance', label: 'Compliance', icon: '✅' },
              { key: 'financial', label: 'Financial', icon: '💰' },
              { key: 'loans', label: 'Loans', icon: '🏦' },
              { key: 'timeline', label: 'Timeline', icon: '📋' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setSection(tab.key as ProfileSection)}
                className={`py-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap ${
                  section === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Content Sections */}
        {section === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Profile Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Personal Information */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
                  {isAdmin && (
                    <button
                      onClick={() => setActionModal('edit_profile')}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">First Name</p>
                    <p className="text-sm font-medium text-gray-900">{member.first_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Last Name</p>
                    <p className="text-sm font-medium text-gray-900">{member.last_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Email</p>
                    <p className="text-sm font-medium text-gray-900">{member.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{member.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">ID Number</p>
                    <p className="text-sm font-medium text-gray-900">{member.id_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Date of Birth</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(member.date_of_birth)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Gender</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{member.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Occupation</p>
                    <p className="text-sm font-medium text-gray-900">{member.occupation || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Contact & Emergency</h2>
                  {isAdmin && (
                    <button
                      onClick={() => setActionModal('edit_contact')}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 uppercase">Physical Address</p>
                    <p className="text-sm font-medium text-gray-900">{member.physical_address || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 uppercase">Postal Address</p>
                    <p className="text-sm font-medium text-gray-900">{member.postal_address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Next of Kin</p>
                    <p className="text-sm font-medium text-gray-900">{member.next_of_kin_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Kin Phone</p>
                    <p className="text-sm font-medium text-gray-900">{member.next_of_kin_phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Kin Relationship</p>
                    <p className="text-sm font-medium text-gray-900">{member.next_of_kin_relationship || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Employer</p>
                    <p className="text-sm font-medium text-gray-900">{member.employer || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              {isAdmin && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button
                      onClick={() => setActionModal('savings_deposit')}
                      className="px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-sm font-medium"
                    >
                      💰 Savings Deposit
                    </button>
                    <button
                      onClick={() => setActionModal('savings_withdrawal')}
                      className="px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm font-medium"
                    >
                      💸 Savings Withdrawal
                    </button>
                    <button
                      onClick={() => setActionModal('contribution')}
                      className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium"
                    >
                      🎯 Post Contribution
                    </button>
                    <button
                      onClick={() => setActionModal('fine')}
                      className="px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 text-sm font-medium"
                    >
                      ⚠️ Issue Fine
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Summary */}
            <div className="space-y-6">
              {/* Financial Summary */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Savings</span>
                    <span className="font-semibold text-green-600">{formatCurrency(balances?.savings || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Shares</span>
                    <span className="font-semibold text-blue-600">{formatCurrency(balances?.shares || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Contributions</span>
                    <span className="font-semibold text-purple-600">{formatCurrency(balances?.contributions || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Welfare</span>
                    <span className="font-semibold text-pink-600">{formatCurrency(balances?.welfare || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Outstanding Fines</span>
                    <span className="font-semibold text-red-600">{formatCurrency(balances?.fines || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Outstanding Loans</span>
                    <span className="font-semibold text-orange-600">{formatCurrency(balances?.loans || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Compliance Status */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Status</h2>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Documents Complete</span>
                    <span className="font-medium">{complianceStatus.complete}/{complianceStatus.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${complianceStatus.total ? (complianceStatus.complete / complianceStatus.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
                {complianceStatus.missing > 0 && (
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⚠️ {complianceStatus.missing} required document(s) missing
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setSection('compliance')}
                  className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                >
                  View Details
                </button>
              </div>

              {/* Active Loans */}
              {loans.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Loans</h2>
                  <div className="space-y-3">
                    {loans.slice(0, 3).map(loan => (
                      <div key={loan.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between">
                          <span className="font-medium capitalize">{loan.loan_type}</span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            loan.status === 'active' ? 'bg-green-100 text-green-800' :
                            loan.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Balance: {formatCurrency(loan.outstanding_balance)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'documents' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Document Management</h2>
                  <p className="text-sm text-gray-500">Upload, view, and manage member documents</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setSelectedCategory(documentCategories[0]);
                      setActionModal('upload_document');
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  >
                    + Upload Document
                  </button>
                )}
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No documents uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map(doc => (
                    <div key={doc.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📄</span>
                          <div>
                            <p className="font-medium text-gray-900">{doc.category_name}</p>
                            <p className="text-sm text-gray-500">{formatFileSize(doc.file_size)}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${getDocumentStatusColor(doc.status)}`}>
                          {doc.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Uploaded: {formatDateTime(doc.created_at)}</p>
                      <div className="mt-3 flex gap-2">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-3 py-1.5 text-center text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          View
                        </a>
                        {isAdmin && doc.status !== 'verified' && (
                          <button
                            onClick={() => {
                              setSelectedDocument(doc);
                              setVerificationForm({ status: 'verified', notes: '' });
                              setActionModal('verify_document');
                            }}
                            className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Verify
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'compliance' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">KYC & Compliance Requirements</h2>
              
              {/* Compliance Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{complianceStatus.complete}</p>
                  <p className="text-sm text-green-700">Complete</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">
                    {documents.filter(d => d.status === 'pending').length}
                  </p>
                  <p className="text-sm text-yellow-700">Pending Review</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{complianceStatus.missing}</p>
                  <p className="text-sm text-red-700">Missing</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-gray-600">{complianceStatus.total}</p>
                  <p className="text-sm text-gray-700">Total Required</p>
                </div>
              </div>

              {/* Requirements Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Requirement</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Document</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Verified</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentCategories.map(cat => {
                      const doc = documents.find(d => d.document_type === cat.code);
                      return (
                        <tr key={cat.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-900">{cat.name}</p>
                            <p className="text-sm text-gray-500">{cat.description}</p>
                          </td>
                          <td className="py-3 px-4">
                            {!doc ? (
                              <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                                Not Uploaded
                              </span>
                            ) : (
                              <span className={`px-2 py-1 text-xs rounded ${
                                getDocumentStatusColor(doc.status)
                              }`}>
                                {doc.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {doc ? (
                              <a href={doc.file_url} target="_blank" className="text-indigo-600 hover:underline text-sm">
                                {doc.document_name}
                              </a>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {doc?.verified_at ? (
                              <span className="text-sm text-gray-600">{formatDateTime(doc.verified_at)}</span>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isAdmin && (
                              <div className="flex gap-2">
                                {!doc && (
                                  <button
                                    onClick={() => {
                                      setSelectedCategory(cat);
                                      setActionModal('upload_document');
                                    }}
                                    className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                  >
                                    Upload
                                  </button>
                                )}
                                {doc && doc.status !== 'verified' && (
                                  <button
                                    onClick={() => {
                                      setSelectedDocument(doc);
                                      setVerificationForm({ status: 'verified', notes: '' });
                                      setActionModal('verify_document');
                                    }}
                                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    Verify
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {section === 'financial' && (
          <div className="space-y-6">
            {/* Financial Actions */}
            {isAdmin && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => setActionModal('savings_deposit')}
                  className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow text-center"
                >
                  <span className="text-3xl">💰</span>
                  <p className="mt-2 font-medium text-gray-900">Savings Deposit</p>
                </button>
                <button
                  onClick={() => setActionModal('savings_withdrawal')}
                  className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow text-center"
                >
                  <span className="text-3xl">💸</span>
                  <p className="mt-2 font-medium text-gray-900">Savings Withdrawal</p>
                </button>
                <button
                  onClick={() => setActionModal('contribution')}
                  className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow text-center"
                >
                  <span className="text-3xl">🎯</span>
                  <p className="mt-2 font-medium text-gray-900">Contribution</p>
                </button>
                <button
                  onClick={() => setActionModal('fine')}
                  className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow text-center"
                >
                  <span className="text-3xl">⚠️</span>
                  <p className="mt-2 font-medium text-gray-900">Issue Fine</p>
                </button>
              </div>
            )}

            {/* Transactions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>
              {transactions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No transactions found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Reference</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Type</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, 20).map(tx => (
                        <tr key={tx.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm">{formatDateTime(tx.created_at)}</td>
                          <td className="py-3 px-4 text-sm font-mono">{tx.transaction_ref}</td>
                          <td className="py-3 px-4 text-sm capitalize">{tx.transaction_type.replace(/_/g, ' ')}</td>
                          <td className={`py-3 px-4 text-sm text-right font-medium ${
                            tx.transaction_type.includes('deposit') || tx.transaction_type.includes('repayment') || tx.transaction_type.includes('payment')
                              ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tx.transaction_type.includes('deposit') || tx.transaction_type.includes('repayment') || tx.transaction_type.includes('payment') ? '+' : '-'}
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">{formatCurrency(tx.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Fines */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Outstanding Fines</h2>
              {fines.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No outstanding fines</p>
              ) : (
                <div className="space-y-3">
                  {fines.map(fine => (
                    <div key={fine.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{fine.fine_type.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-500">{fine.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-red-600">{formatCurrency(fine.amount - fine.paid_amount)}</p>
                        <p className="text-sm text-gray-500">
                          Paid: {formatCurrency(fine.paid_amount)} / {formatCurrency(fine.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'loans' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Loan History</h2>
              {loans.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No loans found</p>
              ) : (
                <div className="space-y-4">
                  {loans.map(loan => (
                    <div key={loan.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-gray-900 capitalize">{loan.loan_type}</h3>
                          <p className="text-sm text-gray-500">Applied: {formatDate(loan.application_date)}</p>
                        </div>
                        <span className={`px-3 py-1 text-sm rounded-full ${
                          loan.status === 'active' || loan.status === 'disbursed' ? 'bg-green-100 text-green-800' :
                          loan.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          loan.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {loan.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Principal</p>
                          <p className="font-medium">{formatCurrency(loan.principal_amount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Interest Rate</p>
                          <p className="font-medium">{loan.interest_rate}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Outstanding</p>
                          <p className="font-medium text-red-600">{formatCurrency(loan.outstanding_balance)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Due Date</p>
                          <p className="font-medium">{formatDate(loan.due_date)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'timeline' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Activity Timeline</h2>
              {activities.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No activities recorded</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                  <div className="space-y-6">
                    {activities.map((activity, index) => (
                      <div key={activity.id || index} className="relative pl-10">
                        <div className="absolute left-2.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white"></div>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-gray-900 capitalize">
                              {activity.action.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-gray-500">{formatDateTime(activity.created_at)}</p>
                          </div>
                          <p className="text-sm text-gray-600">{activity.description}</p>
                          {activity.actor_name && activity.actor_name !== 'System' && (
                            <p className="text-xs text-gray-400 mt-1">by {activity.actor_name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ============================================ */}
      {/* MODALS */}
      {/* ============================================ */}

      {/* Edit Profile Modal */}
      {actionModal === 'edit_profile' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Edit Member Profile</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={profileForm.first_name}
                    onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={profileForm.last_name}
                    onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                  <input
                    type="text"
                    value={profileForm.id_number}
                    onChange={(e) => setProfileForm({ ...profileForm, id_number: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={profileForm.date_of_birth}
                    onChange={(e) => setProfileForm({ ...profileForm, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                  <input
                    type="text"
                    value={profileForm.occupation}
                    onChange={(e) => setProfileForm({ ...profileForm, occupation: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
                  <input
                    type="text"
                    value={profileForm.employer}
                    onChange={(e) => setProfileForm({ ...profileForm, employer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Physical Address</label>
                  <textarea
                    value={profileForm.physical_address}
                    onChange={(e) => setProfileForm({ ...profileForm, physical_address: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProfile}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {actionModal === 'edit_contact' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Edit Contact Information</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next of Kin Name</label>
                <input
                  type="text"
                  value={contactForm.next_of_kin_name}
                  onChange={(e) => setContactForm({ ...contactForm, next_of_kin_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next of Kin Phone</label>
                <input
                  type="tel"
                  value={contactForm.next_of_kin_phone}
                  onChange={(e) => setContactForm({ ...contactForm, next_of_kin_phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                <input
                  type="text"
                  value={contactForm.next_of_kin_relationship}
                  onChange={(e) => setContactForm({ ...contactForm, next_of_kin_relationship: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateContact}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {(actionModal === 'savings_deposit' || actionModal === 'savings_withdrawal' || actionModal === 'contribution') && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">
                {actionModal === 'savings_deposit' && 'Post Savings Deposit'}
                {actionModal === 'savings_withdrawal' && 'Post Savings Withdrawal'}
                {actionModal === 'contribution' && 'Post Contribution'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                <input
                  type="number"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input
                  type="text"
                  value={transactionForm.reference}
                  onChange={(e) => setTransactionForm({ ...transactionForm, reference: e.target.value })}
                  placeholder="Optional reference..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={actionModal === 'contribution' ? handlePostContribution : handlePostTransaction}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fine Modal */}
      {actionModal === 'fine' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Issue Fine</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fine Type *</label>
                <select
                  value={transactionForm.fineType}
                  onChange={(e) => setTransactionForm({ ...transactionForm, fineType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="meeting_absence">Meeting Absence</option>
                  <option value="late_payment">Late Payment</option>
                  <option value="penalty">Penalty</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                <input
                  type="number"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea
                  value={transactionForm.reason}
                  onChange={(e) => setTransactionForm({ ...transactionForm, reason: e.target.value })}
                  placeholder="Enter reason for fine..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setTransactionForm({ amount: '', description: '', reference: '', fineType: 'meeting_absence', reason: '' }); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueFine}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Issue Fine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {actionModal === 'approve' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-green-600">✓ Approve Member</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                This will activate the membership and grant the member full access to all services.
              </p>
              {complianceStatus.missing > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Warning: {complianceStatus.missing} required document(s) are still missing.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comments (Optional)</label>
                <textarea
                  value={approvalForm.comments}
                  onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })}
                  placeholder="Add any comments..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveMember}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {actionModal === 'reject' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-red-600">✗ Reject Member</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                Please provide a reason for rejection. The member will be notified.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Rejection *</label>
                <textarea
                  value={approvalForm.comments}
                  onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })}
                  placeholder="Explain why this application is being rejected..."
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectMember}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {actionModal === 'suspend' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-yellow-600">⚠ Suspend Member</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                This will temporarily suspend the member's access to all services.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Suspension</label>
                <textarea
                  value={approvalForm.comments}
                  onChange={(e) => setApprovalForm({ ...approvalForm, comments: e.target.value })}
                  placeholder="Explain why this member is being suspended..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspendMember}
                disabled={submitting}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {actionModal === 'reactivate' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-green-600">✓ Reactivate Member</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600">
                This will restore the member's full access to all services.
              </p>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReactivateMember}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Reactivate Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {actionModal === 'upload_document' && selectedCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Upload Document</h3>
              <p className="text-sm text-gray-500">{selectedCategory.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={selectedCategory.allowed_mime_types?.join(',')}
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max size: {selectedCategory.max_file_size_mb}MB
                </p>
              </div>
              {submitting && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500">Uploading...</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setSelectedCategory(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Document Modal */}
      {actionModal === 'verify_document' && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Verify Document</h3>
              <p className="text-sm text-gray-500">{selectedDocument.category_name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Verification Status</label>
                <select
                  value={verificationForm.status}
                  onChange={(e) => setVerificationForm({ ...verificationForm, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={verificationForm.notes}
                  onChange={(e) => setVerificationForm({ ...verificationForm, notes: e.target.value })}
                  placeholder="Add verification notes..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setSelectedDocument(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyDocument}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
