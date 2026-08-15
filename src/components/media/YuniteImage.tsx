'use client';

/**
 * <YuniteImage /> — central image DISPLAY component.
 *
 * Handles asset resolution, URL resolution, missing image, loading, broken
 * image, fallback avatar/logo, and cache versioning. Every module that shows
 * an image uses this — no module implements its own image handling.
 *
 * Resolution: calls GET /api/media/{ownerType}/{ownerId}/{assetType} which
 * returns the active asset's cache-busted URL (uploaded asset OR external URL).
 * Falls back to `fallback` (an initials avatar / org-name text) when no asset
 * exists or the image errors.
 */

import { useEffect, useState } from 'react';
import type { MediaOwnerType, MediaAssetType } from '@/lib/services/media/media-asset.service';

export interface YuniteImageProps {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  /** Initials/name to render when no image is available (avatar fallback). */
  fallback?: string;
  /** Variant: 'avatar' (round) or 'logo' (rectangle). */
  variant?: 'avatar' | 'logo';
  className?: string;
  alt?: string;
  /** Optional explicit URL to render instead of resolving (legacy passthrough). */
  explicitUrl?: string | null;
  /** Bump to force a re-resolve from the media engine (e.g. after upload). */
  refreshKey?: number;
}

export function YuniteImage({
  ownerType,
  ownerId,
  assetType,
  fallback,
  variant = 'avatar',
  className = '',
  alt = '',
  explicitUrl,
  refreshKey,
}: YuniteImageProps) {
  const [url, setUrl] = useState<string | null>(explicitUrl ?? null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (explicitUrl !== undefined) {
      setUrl(explicitUrl);
      setErrored(false);
      return;
    }
    let cancelled = false;
    setErrored(false);
    fetch(`/api/media/${ownerType}/${ownerId}/${assetType}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setUrl(data?.url ?? null);
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId, assetType, explicitUrl, refreshKey]);

  const shape = variant === 'avatar' ? 'rounded-full' : 'rounded-lg';
  const base = variant === 'avatar' ? 'h-10 w-10' : 'h-16 w-16 object-contain';

  if (!url || errored) {
    // Fallback: initials avatar or a branded placeholder block.
    const initials = (fallback || 'Y').trim().slice(0, 2).toUpperCase();
    return (
      <div
        className={`${shape} ${base} ${className} flex items-center justify-center bg-gradient-to-br from-[#0B2A4A] to-[#22C55E] text-white font-semibold text-sm`}
        aria-label={alt || fallback || 'No image'}
      >
        {variant === 'avatar' ? initials : <span className="text-[10px]">LOGO</span>}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt || fallback || 'image'}
      onError={() => setErrored(true)}
      className={`${shape} ${base} ${className} object-cover border border-gray-200`}
    />
  );
}
