import { NextRequest } from 'next/server';
import { documentExportService, ORG_IDENTITY } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

interface VerifyResult {
  success: boolean;
  verified: boolean;
  document?: any;
  organization?: string;
  error?: string;
}

async function verifyRef(ref: string): Promise<VerifyResult> {
  if (!ref) return { success: false, verified: false, error: 'Reference required' };
  let record;
  try {
    record = await documentExportService.verifyByRef(ref);
  } catch {
    return {
      success: false,
      verified: false,
      error: 'Verification is temporarily unavailable. Please try again later.',
      organization: ORG_IDENTITY.name,
    };
  }
  if (!record) {
    return {
      success: false,
      verified: false,
      error: 'Document not found in the system. This document may be forged or was never issued by Yunite Pamoja CBO.',
      organization: ORG_IDENTITY.name,
    };
  }
  const expired = record.expires_at ? new Date(record.expires_at).getTime() < Date.now() : false;
  return {
    success: true,
    verified: !record.revoked && !expired,
    organization: ORG_IDENTITY.name,
    document: {
      ref: record.doc_ref,
      title: record.title,
      report_type: record.report_type,
      period: record.period_label,
      member_number: record.member_number,
      issued_by: record.generated_by_name,
      issued_at: record.generated_at,
      auth_hash: record.auth_hash,
      status: record.revoked ? 'revoked' : expired ? 'expired' : 'valid',
      expires_at: record.expires_at,
      revoked_at: record.revoked_at,
    },
  };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: { ref: string };
  searchParams: NextRequest['nextUrl']['searchParams'];
}) {
  const ref = decodeURIComponent(params.ref || '');
  const result = await verifyRef(ref);
  const doc = result.document;
  const issuedAt = doc ? new Date(doc.issued_at) : null;

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, Helvetica, sans-serif', background: '#F8FAFC', color: '#1F2937' }}>
        <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
          {/* Letterhead */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src="/branding/logo.svg" alt="Yunite Pamoja CBO" style={{ height: 48, width: 'auto' }} />
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0B2A4A' }}>{ORG_IDENTITY.name}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{ORG_IDENTITY.tagline} · {ORG_IDENTITY.address}, {ORG_IDENTITY.city}, {ORG_IDENTITY.country}</div>
              </div>
            </div>
            <div style={{ height: 4, background: 'linear-gradient(90deg,#0B2A4A 0%,#0B2A4A 62%,#22C55E 62%,#22C55E 100%)' }} />
          </div>

          {/* Verification result */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', marginTop: 16, padding: 28 }}>
            <h1 style={{ marginTop: 0, color: '#0B2A4A', fontFamily: 'Georgia, serif', fontSize: 24 }}>
              Document Authenticity Verification
            </h1>
            <p style={{ color: '#6B7280', fontSize: 13, marginTop: -8 }}>
              Enter or scan a document reference to confirm it was issued by {ORG_IDENTITY.name}.
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input
                defaultValue={ref}
                placeholder="Document reference (e.g. YP-DOC/.../...)"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13 }}
                id="refInput"
                name="ref"
              />
              <form style={{ display: 'inline' }}>
                <button
                  type="submit"
                  formAction={`/verify`}
                  style={{ padding: '10px 18px', background: '#0B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Verify
                </button>
              </form>
            </div>
            <style>{`input[name=ref] { width: 100% }`}</style>

            <div style={{ marginTop: 24 }}>
              {result.verified ? (
                <div style={{ background: '#E8FFF0', border: '1px solid #22C55E55', borderRadius: 10, padding: 16 }}>
                  <div style={{ color: '#15803D', fontWeight: 700, fontSize: 15 }}>✅ AUTHENTIC DOCUMENT</div>
                  <div style={{ color: '#0B2A4A', fontSize: 13, marginTop: 6 }}>This document was verified as genuine and issued by {ORG_IDENTITY.name}.</div>
                </div>
              ) : (
                <div style={{ background: '#FEF2F2', border: '1px solid #DC262655', borderRadius: 10, padding: 16 }}>
                  <div style={{ color: '#B91C1C', fontWeight: 700, fontSize: 15 }}>
                    {doc?.status === 'revoked' ? '⚠️ DOCUMENT REVOKED' : doc?.status === 'expired' ? '⚠️ DOCUMENT EXPIRED' : '❌ DOCUMENT NOT FOUND'}
                  </div>
                  <div style={{ color: '#7F1D1D', fontSize: 13, marginTop: 6 }}>{result.error}</div>
                </div>
              )}

              {doc && (
                <table style={{ width: '100%', marginTop: 20, fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', width: '40%' }}>Document Title</td><td style={{ fontWeight: 600, color: '#0B2A4A' }}>{doc.title}</td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Document Reference</td><td style={{ fontWeight: 600, color: '#0B2A4A', borderTop: '1px solid #F1F5F9' }}><code>{doc.ref}</code></td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Authenticity Hash</td><td style={{ fontWeight: 600, color: '#0B2A4A', borderTop: '1px solid #F1F5F9' }}><code>{doc.auth_hash}</code></td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Report Type</td><td style={{ color: '#1F2937', borderTop: '1px solid #F1F5F9' }}>{doc.report_type.replace(/_/g, ' ')}</td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Period</td><td style={{ color: '#1F2937', borderTop: '1px solid #F1F5F9' }}>{doc.period || '—'}</td></tr>
                    {doc.member_number ? (
                      <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Member Number</td><td style={{ color: '#1F2937', borderTop: '1px solid #F1F5F9' }}>{doc.member_number}</td></tr>
                    ) : null}
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Issued By</td><td style={{ color: '#1F2937', borderTop: '1px solid #F1F5F9' }}>{doc.issued_by}</td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Issued At</td><td style={{ color: '#1F2937', borderTop: '1px solid #F1F5F9' }}>{issuedAt ? issuedAt.toLocaleString('en-GB') : '—'}</td></tr>
                    <tr><td style={{ padding: '8px 0', color: '#6B7280', borderTop: '1px solid #F1F5F9' }}>Status</td><td style={{ fontWeight: 700, color: doc.status === 'valid' ? '#15803D' : '#B91C1C', borderTop: '1px solid #F1F5F9', textTransform: 'uppercase' }}>{doc.status}</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11, marginTop: 24 }}>
            {ORG_IDENTITY.copyright}
          </p>
        </div>
      </body>
    </html>
  );
}
