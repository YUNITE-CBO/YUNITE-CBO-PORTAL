'use client';

/**
 * Member Documents & Compliance Page - Phase 4
 * Enterprise Document, Media & Compliance Management System
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_required: boolean;
  allowed_mime_types: string[] | null;
  max_file_size_mb: number;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  uploaded_at: string;
  verified_by: string | null;
  verified_at: string | null;
  category_name?: string;
  category_code?: string;
  category_is_required?: boolean;
}

interface MemberCompliance {
  member_id: string;
  workflow_id: string;
  current_stage: string;
  compliance_score: number;
  required_documents_complete: boolean;
  total_required: number;
  approved_count: number;
  pending_count: number;
  missing_count: number;
  requirements: {
    category_code: string;
    category_name: string;
    is_required: boolean;
    status: string;
    document_id: string | null;
    document_name: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
  }[];
}

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  status: string;
}

export default function MemberDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // User state
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [compliance, setCompliance] = useState<MemberCompliance | null>(null);
  
  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchSession();
    fetchMembers();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      fetchMemberData(selectedMember.id);
    }
  }, [selectedMember]);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.success && data.data) {
        setCurrentUser(data.data.user);
        setIsAdmin(['super_admin', 'admin', 'staff'].includes(data.data.user.role));
      }
    } catch (err) {
      console.error('Failed to fetch session:', err);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      if (data.success) {
        setMembers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/document-categories?module=members');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchMemberData = async (memberId: string) => {
    try {
      const [docsRes, complianceRes] = await Promise.all([
        fetch(`/api/documents?module=members&entityType=member&entityId=${memberId}`),
        fetch(`/api/compliance?memberId=${memberId}`)
      ]);

      const [docsData, complianceData] = await Promise.all([
        docsRes.json(),
        complianceRes.json()
      ]);

      if (docsData.success) {
        setDocuments(docsData.data || []);
      }

      if (complianceData.success) {
        setCompliance(complianceData.data);
      }
    } catch (err) {
      console.error('Failed to fetch member data:', err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadCategory || !selectedMember) {
      setError('Please select a file and category');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('module', 'members');
      formData.append('entityType', 'member');
      formData.append('entityId', selectedMember.id);
      formData.append('categoryCode', uploadCategory);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Document uploaded successfully');
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadCategory('');
        // Refresh member data
        await fetchMemberData(selectedMember.id);
      } else {
        setError(data.error || 'Failed to upload document');
      }
    } catch (err) {
      setError('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyDocument = async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Document verified successfully');
        await fetchMemberData(selectedMember!.id);
      } else {
        setError(data.error || 'Failed to verify document');
      }
    } catch (err) {
      setError('Failed to verify document');
    }
  };

  const handleApproveCompliance = async (categoryCode: string) => {
    if (!selectedMember) return;

    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          categoryCode,
          action: 'approve'
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Compliance approved');
        await fetchMemberData(selectedMember.id);
      } else {
        setError(data.error || 'Failed to approve compliance');
      }
    } catch (err) {
      setError('Failed to approve compliance');
    }
  };

  const handleRejectCompliance = async (categoryCode: string, reason: string) => {
    if (!selectedMember) return;

    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          categoryCode,
          action: 'reject',
          notes: reason
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Compliance rejected');
        await fetchMemberData(selectedMember.id);
      } else {
        setError(data.error || 'Failed to reject compliance');
      }
    } catch (err) {
      setError('Failed to reject compliance');
    }
  };

  const handleDeleteClick = (doc: Document) => {
    setDeletingDoc(doc);
    setDeleteReason('');
    setShowDeleteModal(true);
  };

  const handleDeleteDocument = async () => {
    if (!deletingDoc || !selectedMember) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/documents/${deletingDoc.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Document deleted successfully');
        setShowDeleteModal(false);
        setDeletingDoc(null);
        // Refresh member data
        await fetchMemberData(selectedMember.id);
      } else {
        setError(data.error || 'Failed to delete document');
      }
    } catch (err) {
      setError('Failed to delete document');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string }> = {
      pending: { bg: 'bg-gray-100', text: 'text-gray-800' },
      approved: { bg: 'bg-green-100', text: 'text-green-800' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800' },
      submitted: { bg: 'bg-blue-100', text: 'text-blue-800' },
      under_review: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      verified: { bg: 'bg-green-100', text: 'text-green-800' },
      expired: { bg: 'bg-red-100', text: 'text-red-800' },
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📗';
    return '📄';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Member Documents & Compliance</h1>
        <p className="text-gray-600 mt-1">
          Manage member documents, verify compliance, and track document requirements.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Member Selection */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Member</h2>
        <select
          value={selectedMember?.id || ''}
          onChange={(e) => {
            const member = members.find(m => m.id === e.target.value);
            setSelectedMember(member || null);
          }}
          className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- Select a member --</option>
          {members.map(member => (
            <option key={member.id} value={member.id}>
              {member.first_name} {member.last_name} ({member.member_number}) - {member.status}
            </option>
          ))}
        </select>
      </div>

      {selectedMember && (
        <>
          {/* Compliance Overview */}
          {compliance && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border p-6">
                <div className="text-3xl font-bold text-gray-900">{compliance.compliance_score}%</div>
                <div className="text-sm text-gray-500 mt-1">Compliance Score</div>
              </div>
              <div className="bg-white rounded-xl border p-6">
                <div className="text-3xl font-bold text-green-600">{compliance.approved_count}</div>
                <div className="text-sm text-gray-500 mt-1">Approved</div>
              </div>
              <div className="bg-white rounded-xl border p-6">
                <div className="text-3xl font-bold text-yellow-600">{compliance.pending_count}</div>
                <div className="text-sm text-gray-500 mt-1">Pending</div>
              </div>
              <div className="bg-white rounded-xl border p-6">
                <div className="text-3xl font-bold text-red-600">{compliance.missing_count}</div>
                <div className="text-sm text-gray-500 mt-1">Missing</div>
              </div>
            </div>
          )}

          {/* Compliance Requirements */}
          {compliance && (
            <div className="bg-white rounded-xl border p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Compliance Requirements</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  compliance.required_documents_complete 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {compliance.required_documents_complete ? 'Ready for Approval' : 'Documents Pending'}
                </span>
              </div>

              <div className="space-y-4">
                {compliance.requirements.map(req => (
                  <div key={req.category_code} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        {req.is_required ? '📋' : '📄'}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {req.category_name}
                          {req.is_required && <span className="text-red-500 ml-1">*</span>}
                        </div>
                        <div className="text-sm text-gray-500">
                          {req.document_name || 'No document uploaded'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(req.status)}
                      {isAdmin && req.document_id && req.status === 'submitted' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveCompliance(req.category_code)}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt('Enter rejection reason:');
                              if (reason) handleRejectCompliance(req.category_code, reason);
                            }}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded Documents */}
          <div className="bg-white rounded-xl border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Uploaded Documents</h2>
              {isAdmin && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Upload Document
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents uploaded for this member
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map(doc => (
                  <div key={doc.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getFileIcon(doc.mime_type)}</span>
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">
                            {doc.file_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(doc.status)}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {doc.file_path && (
                        <a
                          href={doc.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          View
                        </a>
                      )}
                      {isAdmin && doc.status === 'pending' && (
                        <button
                          onClick={() => handleVerifyDocument(doc.id)}
                          className="px-3 py-1 text-sm text-green-600 hover:text-green-800"
                        >
                          Verify
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteClick(doc)}
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
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
        </>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Document</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- Select category --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.code}>
                      {cat.name} {cat.is_required && '(Required)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File
                </label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Accepted: Images, PDF, Word, Excel (max 10MB)
                </p>
              </div>

              {uploadFile && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium">{uploadFile.name}</div>
                  <div className="text-xs text-gray-500">
                    {formatFileSize(uploadFile.size)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadCategory('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Document</h3>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-600">
                Are you sure you want to delete this document? This action cannot be undone.
              </p>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getFileIcon(deletingDoc.mime_type)}</span>
                  <div>
                    <div className="font-medium text-gray-900 truncate max-w-[250px]">
                      {deletingDoc.file_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatFileSize(deletingDoc.file_size)} • Uploaded {formatDate(deletingDoc.uploaded_at)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for deletion <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Enter reason for deleting this document..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingDoc(null);
                  setDeleteReason('');
                }}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocument}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Document'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
