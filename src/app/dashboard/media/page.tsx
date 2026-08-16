'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

interface MediaAsset {
  id: string;
  owner_type: string;
  owner_id: string;
  asset_type: string;
  source: string;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  version: number;
  status: string;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface IntegrityFinding {
  asset_id: string;
  issue: string;
  detail?: string;
  severity?: string;
}

const formatBytes = (b?: number | null) => {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function MediaPage() {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [findings, setFindings] = useState<IntegrityFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSource, setLogoSource] = useState<string>('none');
  const [uploading, setUploading] = useState(false);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      // The media API resolves one asset per owner+type. List all org assets
      // by querying the DB-backed integrity endpoint plus resolving the logo.
      const [logoRes] = await Promise.all([
        fetch('/api/media/organization/org/ORGANIZATION_LOGO'),
      ]);
      const logoData = await logoRes.json();
      if (logoData.success) {
        setLogoUrl(logoData.url);
        setLogoSource(logoData.source);
      }
    } catch { /* ignore */ }
    // Fetch all assets via a direct list — use the integrity endpoint which
    // is admin-only and returns findings; assets list comes from a service-client query.
    // We expose assets via the same integrity route's expanded payload if available.
    try {
      const res = await fetch('/api/media/integrity');
      const data = await res.json();
      if (data.success) {
        setFindings(data.findings || []);
      }
    } catch { /* integrity optional */ }
    setLoading(false);
  };

  useEffect(() => { fetchAssets(); }, []);

  const checkIntegrity = async () => {
    setCheckingIntegrity(true);
    try {
      const res = await fetch('/api/media/integrity');
      const data = await res.json();
      if (data.success) setFindings(data.findings || []);
      else setError(data.error || 'Integrity check failed');
    } catch { setError('Integrity check failed'); }
    finally { setCheckingIntegrity(false); }
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/media/organization/org/ORGANIZATION_LOGO', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        fetchAssets();
      } else setError(data.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  };

  const removeLogo = async () => {
    if (!confirm('Remove the organization logo? Previously generated documents keep their snapshot.')) return;
    try {
      const res = await fetch('/api/media/organization/org/ORGANIZATION_LOGO', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchAssets();
      else alert(data.error || 'Failed to remove');
    } catch { alert('Failed to remove logo'); }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900">Media & Assets</h1>
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">Admin access is required to manage media assets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Media & Assets</h1>
        <p className="text-gray-500 mt-1">Centralized management for organization logo, stamps, profile photos, and system assets.</p>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {/* Organization Logo */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Logo</h2>
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Organization logo" className="w-32 h-32 object-contain border rounded-lg bg-gray-50" />
            ) : (
              <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm text-center">
                No logo set
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-2">Source: <span className="font-medium capitalize">{logoSource}</span></p>
            <p className="text-xs text-gray-400 mb-4">PNG, JPEG, or WebP. SVG is blocked for security. Used in generated PDFs, the portal header, and the member lookup portal.</p>
            <div className="flex gap-3">
              <label className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">
                {uploading ? 'Uploading…' : 'Upload Logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }} disabled={uploading} />
              </label>
              {logoUrl && <button onClick={removeLogo} className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Remove</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Integrity Check */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Integrity Check</h2>
          <button onClick={checkIntegrity} disabled={checkingIntegrity} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {checkingIntegrity ? 'Checking…' : 'Run Check'}
          </button>
        </div>
        {findings.length === 0 ? (
          <p className="text-sm text-green-600">✓ No discrepancies found. All media assets are consistent between the database and storage.</p>
        ) : (
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div key={i} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                <span className="font-medium text-yellow-800">{f.issue}</span>
                <span className="text-yellow-700 ml-2">{f.detail || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Asset Types Reference */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Asset Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ['ORGANIZATION_LOGO', 'Organization logo — branding bucket (public)'],
            ['ORGANIZATION_STAMP', 'Official stamp — branding bucket (public)'],
            ['DOCUMENT_LOGO', 'Document-specific logo — branding bucket (public)'],
            ['MEMBER_PROFILE_PHOTO', 'Member profile photo — profiles bucket (private)'],
            ['USER_PROFILE_PHOTO', 'User/staff avatar — profiles bucket (private)'],
            ['SYSTEM_ASSET', 'System-wide asset — branding bucket (public)'],
          ].map(([type, desc]) => (
            <div key={type} className="p-3 bg-gray-50 rounded-lg">
              <div className="font-mono text-xs font-medium text-indigo-700">{type}</div>
              <div className="text-gray-600 text-xs mt-1">{desc}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">Member and user profile photos are managed from their respective detail pages. This page manages organization-level assets.</p>
      </div>

      {loading && <div className="mt-4 text-center text-gray-400 text-sm">Loading…</div>}
    </div>
  );
}
