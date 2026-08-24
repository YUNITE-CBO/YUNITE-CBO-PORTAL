const MIN_JWT_SECRET_LENGTH = 32;

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error('SUPABASE_JWT_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}
