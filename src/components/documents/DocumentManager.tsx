'use client';

/**
 * DocumentManager - Reusable Document Management Component
 * 
 * A centralized, reusable component for document management that can be
 * used across all YUNITE modules with module-specific behavior.
 */

import React, { useState, useCallback, useRef } from 'react';

interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  is_required: boolean;
  allowed_mime_types: string[];
  max_file_size_mb: number;
}

interface Document {
  id: string;
  document_ref: string;
  file_name: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  file_path: string;
  module: string;
  entity_type: string;
  entity_id: string;
  category_code: string;
  version: number;
  status: string;
  is_verified: boolean;
  verified_at: string | null;
  expiry_date: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
  is_archived: boolean;
  metadata: Record<string, unknown>;
}

interface DocumentManagerProps {
  module: string;
  entityId: string;
  entityType?: string;
  categories?: DocumentCategory[];
  documents?: Document[];
  onUpload?: (file: File, categoryCode: string) => Promise<void>;
  onDelete?: (documentId: string) => Promise<void>;
  onVerify?: (documentId: string) => Promise<void>;
  onApprove?: (documentId: string) => Promise<void>;
  onReject?: (documentId: string, reason: string) => Promise<void>;
  onDownload?: (documentId: string) => Promise<string>;
  readOnly?: boolean;
  showComplianceStatus?: boolean;
  compact?: boolean;
}

export default function DocumentManager({
  module,
  entityId,
  entityType = 'unknown',
  categories = [],
  documents: initialDocuments = [],
  onUpload,
  onDelete,
  onVerify,
  onApprove,
  onReject,
  onDownload,
  readOnly = false,
  showComplianceStatus = false,
  compact = false,
}: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch documents on mount
  React.useEffect(() => {
    if (entityId) {
      fetchDocuments();
    }
  }, [entityId, module]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/documents?module=${module}&entityType=${entityType}&entityId=${entityId}`
      );
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`/api/documents?categories=true&module=${module}`);
      const data = await res.json();
      if (data.success) {
        return data.data as DocumentCategory[];
      }
      return [];
    } catch {
      return [];
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowUploadModal(true);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowUploadModal(true);
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !selectedCategory) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('module', module);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      formData.append('categoryCode', selectedCategory);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        await fetchDocuments();
        setShowUploadModal(false);
        setSelectedFile(null);
        setSelectedCategory('');
        onUpload?.(selectedFile, selectedCategory);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setDocuments(prev => prev.filter(d => d.id !== documentId));
        onDelete?.(documentId);
      } else {
        setError(data.error || 'Delete failed');
      }
    } catch {
      setError('Failed to delete document');
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}?action=download`);
      const data = await res.json();

      if (data.success && data.data?.url) {
        window.open(data.data.url, '_blank');
        onDownload?.(documentId);
      }
    } catch {
      setError('Failed to download document');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📗';
    return '📄';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      under_review: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Under Review' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
      expired: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Expired' },
      archived: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Archived' },
    };
    const badge = badges[status] || badges.draft;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getComplianceStatus = () => {
    const requiredCategories = categories.filter(c => c.is_required);
    const requiredCodes = new Set(requiredCategories.map(c => c.code));
    const uploadedRequired = documents.filter(
      d => requiredCodes.has(d.category_code) && d.status === 'approved'
    );
    const score = requiredCategories.length > 0
      ? Math.round((uploadedRequired.length / requiredCategories.length) * 100)
      : 100;

    return {
      total: requiredCategories.length,
      uploaded: uploadedRequired.length,
      score,
      complete: score === 100,
    };
  };

  // Group documents by category
  const documentsByCategory = documents.reduce((acc, doc) => {
    if (!acc[doc.category_code]) {
      acc[doc.category_code] = [];
    }
    acc[doc.category_code].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  if (compact) {
    return (
      <div className="space-y-2">
        {documents.length === 0 ? (
          <p className="text-gray-500 text-sm">No documents attached</p>
        ) : (
          <div className="space-y-1">
            {documents.slice(0, 3).map(doc => (
              <div key={doc.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{getFileIcon(doc.mime_type)}</span>
                  <span className="truncate max-w-[150px]">{doc.file_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(doc.status)}
                  <button
                    onClick={() => handleDownload(doc.id)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
            {documents.length > 3 && (
              <p className="text-gray-500 text-xs">+{documents.length - 3} more documents</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right font-medium"
          >
            ×
          </button>
        </div>
      )}

      {/* Compliance Status */}
      {showComplianceStatus && (
        <div className={`p-4 rounded-lg ${getComplianceStatus().complete ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Compliance Score</h4>
              <p className="text-sm text-gray-600">
                {getComplianceStatus().uploaded} of {getComplianceStatus().total} required documents approved
              </p>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {getComplianceStatus().score}%
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getComplianceStatus().complete ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${getComplianceStatus().score}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload Area */}
      {!readOnly && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="space-y-2">
            <div className="text-gray-600">
              Drag and drop a file here, or
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Select File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept={categories.map(c => c.allowed_mime_types).flat().join(',')}
            />
          </div>
        </div>
      )}

      {/* Documents List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full mx-auto"></div>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No documents uploaded yet
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(documentsByCategory).map(([categoryCode, docs]) => {
            const category = categories.find(c => c.code === categoryCode);
            const latestDoc = docs[0]; // Most recent

            return (
              <div key={categoryCode} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {category?.name || categoryCode}
                      {category?.is_required && <span className="text-red-500 ml-1">*</span>}
                    </h4>
                    {category?.description && (
                      <p className="text-sm text-gray-500">{category.description}</p>
                    )}
                  </div>
                  {getStatusBadge(latestDoc.status)}
                </div>

                <div className="space-y-2">
                  {docs.map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getFileIcon(doc.mime_type)}</span>
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">
                            {doc.file_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(doc.file_size)} • Uploaded {formatDate(doc.uploaded_at)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownload(doc.id)}
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                        >
                          View
                        </button>
                        {!readOnly && (
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Upload Document</h3>

            <div className="space-y-4">
              {/* Selected File */}
              {selectedFile && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getFileIcon(selectedFile.type)}</span>
                    <div>
                      <div className="font-medium">{selectedFile.name}</div>
                      <div className="text-sm text-gray-500">
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
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
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setSelectedCategory('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !selectedCategory || uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
