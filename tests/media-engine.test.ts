/**
 * YUNITE Media & Asset Engine — core service unit tests.
 *
 * Tests the pure functions (magic-byte detection, dimension parsing, URL
 * validation, cache-busting) that don't require a live Supabase connection.
 * The service methods (upload/resolve/remove) hit Supabase Storage + the
 * media_assets table and are exercised via integration/manual testing.
 */
import {
  detectMimeType,
  detectDimensions,
  validateExternalUrl,
  cacheBust,
} from '@/lib/services/media/media-asset.service';

// ---- magic-byte / MIME detection ------------------------------------------

describe('detectMimeType (magic bytes, never trusts the extension)', () => {
  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  // Minimal RIFF....WEBP header (offset 0-3 RIFF, 8-11 WEBP).
  const WEBP_HEADER = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  // A RIFF that is NOT WebP (e.g. WAV) — must be rejected.
  const RIFF_NOT_WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);

  test('detects a real PNG from its signature', () => {
    expect(detectMimeType(Buffer.concat([PNG_HEADER, Buffer.alloc(8)]))).toBe('image/png');
  });

  test('detects a real JPEG from its signature', () => {
    expect(detectMimeType(JPEG_HEADER)).toBe('image/jpeg');
  });

  test('detects a real WebP (RIFF + WEBP fourcc)', () => {
    expect(detectMimeType(WEBP_HEADER)).toBe('image/webp');
  });

  test('rejects a RIFF file that is NOT WebP (e.g. WAV)', () => {
    expect(detectMimeType(RIFF_NOT_WEBP)).toBeNull();
  });

  test('rejects SVG / text / arbitrary bytes (SVG is blocked by design)', () => {
    expect(detectMimeType(Buffer.from('<svg></svg>'))).toBeNull();
    expect(detectMimeType(Buffer.from('hello world'))).toBeNull();
    expect(detectMimeType(Buffer.from([]))).toBeNull();
  });

  test('an HTML file disguised as image.png is rejected (extension never trusted)', () => {
    const disguised = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script>');
    expect(detectMimeType(disguised)).toBeNull();
  });
});

// ---- dimension parsing ----------------------------------------------------

describe('detectDimensions', () => {
  test('parses PNG width/height from the IHDR (offset 16/20)', () => {
    // 8-byte signature + 4-byte chunk-length + 4-byte "IHDR" + 4-byte width + 4-byte height
    const buf = Buffer.alloc(24);
    buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47; // sig
    buf.writeUInt32BE(0x00000100, 16); // width 256
    buf.writeUInt32BE(0x000000c8, 20); // height 200
    const dims = detectDimensions(buf, 'image/png');
    expect(dims).toEqual({ width: 256, height: 200 });
  });

  test('returns nulls for a too-short PNG buffer', () => {
    expect(detectDimensions(Buffer.alloc(10), 'image/png')).toEqual({ width: null, height: null });
  });

  test('returns nulls for an unknown mime without throwing', () => {
    expect(detectDimensions(Buffer.alloc(50), 'image/gif')).toEqual({ width: null, height: null });
  });
});

// ---- external URL validation ---------------------------------------------

describe('validateExternalUrl', () => {
  test('accepts https URLs', () => {
    expect(validateExternalUrl('https://example.com/logo.png').ok).toBe(true);
  });

  test('accepts http URLs (allowed for legacy)', () => {
    expect(validateExternalUrl('http://example.com/logo.png').ok).toBe(true);
  });

  test('rejects javascript: scheme (XSS prevention)', () => {
    const r = validateExternalUrl('javascript:alert(1)');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Dangerous|Protocol/i);
  });

  test('rejects file: scheme', () => {
    expect(validateExternalUrl('file:///etc/passwd').ok).toBe(false);
  });

  test('rejects data: scheme', () => {
    expect(validateExternalUrl('data:text/html,<script>').ok).toBe(false);
  });

  test('rejects malformed URLs', () => {
    expect(validateExternalUrl('not a url').ok).toBe(false);
    expect(validateExternalUrl('').ok).toBe(false);
  });
});

// ---- cache-busting --------------------------------------------------------

describe('cacheBust', () => {
  test('appends ?v= on the first replace (version > 1)', () => {
    expect(cacheBust('https://cdn/logo.png', 2)).toBe('https://cdn/logo.png?v=2');
  });

  test('does not stack multiple ?v= params', () => {
    expect(cacheBust('https://cdn/logo.png?v=3', 4)).toBe('https://cdn/logo.png?v=4');
  });

  test('passes v1 through untouched (no needless param)', () => {
    expect(cacheBust('https://cdn/logo.png', 1)).toBe('https://cdn/logo.png');
  });

  test('preserves other query params', () => {
    const out = cacheBust('https://cdn/logo.png?x=1', 2);
    expect(out).toContain('x=1');
    expect(out).toContain('v=2');
  });

  test('null input returns null (never throws)', () => {
    expect(cacheBust(null, 2)).toBeNull();
  });
});
