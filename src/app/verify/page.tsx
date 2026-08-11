import { redirect } from 'next/navigation';
import { ORG_IDENTITY } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

/**
 * /verify?ref=YP-DOC/... → /verify/YP-DOC/...
 * Landing entry for the public document verification portal.
 */
export default function VerifyLandingPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = (searchParams.ref || '').trim();
  if (ref) {
    redirect(`/verify/${encodeURIComponent(ref)}`);
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, Helvetica, sans-serif', background: '#F8FAFC', color: '#1F2937' }}>
        <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
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

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', marginTop: 16, padding: 28 }}>
            <h1 style={{ marginTop: 0, color: '#0B2A4A', fontFamily: 'Georgia, serif', fontSize: 24 }}>
              Document Authenticity Verification
            </h1>
            <p style={{ color: '#6B7280', fontSize: 13, marginTop: -8 }}>
              Every document issued by {ORG_IDENTITY.name} carries a unique reference and authenticity hash. Enter it below to confirm a printed or digital copy is genuine.
            </p>
            <form action="/verify" method="get" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input
                name="ref"
                placeholder="Document reference (e.g. YP-DOC/.../...)"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13 }}
              />
              <button
                type="submit"
                style={{ padding: '10px 18px', background: '#0B2A4A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Verify
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11, marginTop: 24 }}>
            {ORG_IDENTITY.copyright}
          </p>
        </div>
      </body>
    </html>
  );
}
