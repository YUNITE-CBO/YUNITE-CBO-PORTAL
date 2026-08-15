'use client';

/**
 * <YuniteImageUploader /> — central image UPLOAD component.
 *
 * ONE uploader reused by Settings (org logo), Members (profile photo), Users
 * (profile photo), and future modules. Each module only specifies:
 *   assetType, ownerType, ownerId, permissions (enforced server-side).
 *
 * Features (per spec):
 *   - drag & drop with visual drop state
 *   - click to select
 *   - "Use Image URL" mode (legacy URL support retained)
 *   - upload progress + success + error states
 *   - current preview + Replace + Remove
 *   - failure handling: the existing image is never deleted before a new
 *     upload succeeds (the backend enforces this; the UI also preserves the
 *     preview until the new one resolves).
 *
 * Communicates with the single Media Engine API:
 *   GET    /api/media/{ownerType}/{ownerId}/{assetType}
 *   POST   /api/media/...  (multipart file OR JSON {url})
 *   DELETE /api/media/...
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaOwnerType, MediaAssetType } from '@/lib/services/media/media-asset.service';
import { YuniteImage } from './YuniteImage';

export interface YuniteImageUploaderProps {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  /** Label shown above the uploader, e.g. "Organization Logo". */
  label: string;
  /** Name/initials for the fallback avatar. */
  fallbackName?: string;
  variant?: 'avatar' | 'logo';
  /** Called after a successful upload/replace/remove so the host can refresh. */
  onChanged?: () => void;
  className?: string;
}

type Mode = 'idle' | 'url';

export function YuniteImageUploader({
  ownerType,
  ownerId,
  assetType,
  label,
  fallbackName,
  variant = 'avatar',
  onChanged,
  className = '',
}: YuniteImageUploaderProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [source, setSource] = useState<'uploaded' | 'external' | 'none'>('none');
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const apiBase = `/api/media/${ownerType}/${ownerId}/${assetType}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentUrl(data.url ?? null);
      setSource(data.source ?? 'none');
      setOriginalFilename(data.asset?.originalFilename ?? null);
    } catch {
      // ignore — component falls back to "no image"
    }
  }, [apiBase]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const refresh = () => { setRefreshKey((k) => k + 1); onChanged?.(); };

  const doUpload = async (file: File) => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(apiBase, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
      setSuccess('Image updated successfully.');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Your existing image has not been changed.');
    } finally {
      setBusy(false);
    }
  };

  const doUrl = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'URL update failed');
      setSuccess('Image URL saved.');
      setMode('idle'); setUrlInput('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'URL update failed.');
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!confirm('Remove this image?')) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(apiBase, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Remove failed');
      setSuccess('Image removed.');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  const shape = variant === 'avatar' ? 'rounded-full' : 'rounded-lg';

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        {source !== 'none' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {source === 'uploaded' ? 'Uploaded Asset' : 'External URL'}
          </span>
        )}
      </div>

      {/* Current preview */}
      <div className="flex items-center gap-4 mb-4">
        <YuniteImage
          ownerType={ownerType}
          ownerId={ownerId}
          assetType={assetType}
          fallback={fallbackName}
          variant={variant}
          explicitUrl={currentUrl}
          className="h-20 w-20"
          alt={label}
        />
        <div className="flex-1 min-w-0">
          {source !== 'none' ? (
            <>
              <p className="text-xs text-gray-500">
                Current Source: <span className="font-medium text-gray-700">
                  {source === 'uploaded' ? 'Uploaded Asset' : 'External URL'}
                </span>
              </p>
              {originalFilename && source === 'uploaded' && (
                <p className="text-xs text-gray-400 truncate">Asset: {originalFilename}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="px-3 py-1 text-xs bg-[#0B2A4A] text-white rounded-lg hover:bg-[#0B2A4A]/90 disabled:opacity-50"
                >Replace</button>
                <button
                  type="button"
                  onClick={doRemove}
                  disabled={busy}
                  className="px-3 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                >Remove</button>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">No image configured.</p>
          )}
        </div>
      </div>

      {/* Drag & drop area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-[#22C55E] bg-green-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <p className="text-sm text-gray-600">
          {dragOver ? 'Drop image here' : 'Drag & drop a new image here'}
        </p>
        <p className="text-xs text-gray-400 mt-1">or</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          disabled={busy}
          className="mt-2 px-4 py-1.5 text-xs bg-[#0B2A4A] text-white rounded-lg hover:bg-[#0B2A4A]/90 disabled:opacity-50"
        >Upload Image</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doUpload(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMode(mode === 'url' ? 'idle' : 'url'); }}
          disabled={busy}
          className="mt-2 ml-2 px-4 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
        >{mode === 'url' ? 'Cancel URL' : 'Use Image URL'}</button>
      </div>

      {/* URL mode */}
      {mode === 'url' && (
        <div className="mt-3 flex gap-2">
          <input
            type="url"
            placeholder="https://example.com/logo.png"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#0B2A4A]"
          />
          <button
            type="button"
            onClick={doUrl}
            disabled={busy || !urlInput.trim()}
            className="px-4 py-1.5 text-xs bg-[#22C55E] text-white rounded-lg hover:bg-[#22C55E]/90 disabled:opacity-50"
          >Save URL</button>
        </div>
      )}

      {/* States */}
      {busy && (
        <p className="mt-3 text-xs text-blue-600 flex items-center gap-2">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Processing…
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 break-words">{error}</p>}
      {success && <p className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">{success}</p>}
      <p className="mt-3 text-[11px] text-gray-400">Allowed: PNG, JPEG, WebP. SVG is blocked. Max 50 MB (configurable in Settings → Media).</p>
    </div>
  );
}
