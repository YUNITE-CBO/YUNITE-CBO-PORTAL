/**
 * PII sanitizer for AI investigation payloads.
 *
 * Before any data is handed to an AI provider, it is passed through this
 * sanitizer. The objective is to minimize exposure of personally
 * identifiable information to external AI providers while still preserving
 * the values needed for a meaningful investigation (financial amounts,
 * references, structural data).
 *
 * Strategy:
 *  - Replace direct identity fields (phone, email, id_number, names, next of
 *    kin) with hashed/placeholder tokens OR drop them entirely.
 *  - Keep financial fields (amounts, balances, references) — they are NOT
 *    personal data and are essential to the investigation.
 *  - Keep structural fields (status, type, dates, counts, FK ids) — ids are
 *    UUIDs/random tokens, not personal identifiers.
 *
 * This is intentionally conservative: it errs on the side of redacting
 * identifiable human-facing fields. The deterministic engines keep the raw
 * values (never sent to the model) so investigations remain evidence-based.
 */

const PII_KEYS = new Set([
  'first_name', 'last_name', 'full_name', 'name',
  'phone', 'alt_phone', 'mobile', 'telephone',
  'email', 'alt_email',
  'id_number', 'kra_pin', 'national_id', 'passport_number',
  'date_of_birth', 'dob',
  'physical_address', 'postal_address', 'address',
  'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_relationship',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
  'profile_photo_url',
  'employer', 'employer_address', 'occupation',
]);

// Secrets that must NEVER reach an external AI provider (per the security
// requirement: API keys, DB credentials, service-role keys, passwords, auth
// tokens). Matched case-insensitively + by substring on the key.
const SECRET_KEY_SUBSTRINGS = [
  'password', 'secret', 'token', 'api_key', 'apikey', 'service_role',
  'private_key', 'jwt', 'cookie', 'authorization', 'credential',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_SUBSTRINGS.some((s) => k.includes(s));
}

const KEEP_FINANCIAL_HINTS = ['amount', 'balance', 'total', 'paid', 'due', 'rate', 'price', 'fee', 'count', 'score', 'pct'];

function isLikelyFinancial(key: string): boolean {
  const k = key.toLowerCase();
  return KEEP_FINANCIAL_HINTS.some((h) => k.includes(h));
}

/** Best-effort short hash so the model can still correlate rows without PII. */
function redactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const k = key.toLowerCase();
  // Secrets are ALWAYS redacted, regardless of the value shape.
  if (isSecretKey(k)) return 'REDACTED';
  if (PII_KEYS.has(k)) {
    if (typeof value === 'string') {
      if (isLikelyFinancial(k)) return value; // shouldn't happen, defensive
      // Keep a short non-reversible token so the model can reference "member A".
      return `REDACTED:${hashToken(value)}`;
    }
    return 'REDACTED';
  }
  return value;
}

/** Stable short token (non-cryptographic; just for correlation). */
function hashToken(v: string): string {
  let h = 0;
  for (let i = 0; i < v.length; i++) {
    h = (Math.imul(31, h) + v.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

/**
 * Recursively sanitize an object/array. PII keys are redacted; financial +
 * structural values are preserved. This is applied to the tools_payload
 * BEFORE it reaches any provider.
 */
export function sanitizeForAi(payload: unknown): Record<string, unknown> {
  const result = sanitizeInner(payload);
  return (result && typeof result === 'object' && !Array.isArray(result))
    ? (result as Record<string, unknown>)
    : { value: result };
}

function sanitizeInner(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map((v) => sanitizeInner(v));
  if (typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      out[k] = sanitizeInner(redactValue(k, v));
    }
    return out;
  }
  return payload;
}
