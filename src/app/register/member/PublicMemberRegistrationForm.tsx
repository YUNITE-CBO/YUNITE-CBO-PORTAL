'use client';

import { useEffect, useState } from 'react';
import { ORG_IDENTITY } from '@/lib/services/reports/brand';

/**
 * PUBLIC member pre-registration form.
 *
 * Mirrors the EXACT field set captured by the existing admin registration
 * form (src/app/dashboard/members/page.tsx `RegistrationForm`), so the
 * information collected here maps 1:1 onto what the real registration engine
 * expects. Submission does NOT register a member — it stores a pending
 * application awaiting administrator processing.
 */

interface RegistrationForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  alt_email: string;
  id_number: string;
  kra_pin: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  marital_status: string;
  nationality: string;
  physical_address: string;
  postal_address: string;
  occupation: string;
  employer: string;
  employer_address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  next_of_kin_relationship: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

const EMPTY_FORM: RegistrationForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  alt_phone: '',
  alt_email: '',
  id_number: '',
  kra_pin: '',
  date_of_birth: '',
  gender: 'male',
  marital_status: '',
  nationality: '',
  physical_address: '',
  postal_address: '',
  occupation: '',
  employer: '',
  employer_address: '',
  next_of_kin_name: '',
  next_of_kin_phone: '',
  next_of_kin_relationship: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
};

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900';

export default function PublicMemberRegistrationForm() {
  const [formData, setFormData] = useState<RegistrationForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { type: 'success'; reference: string; duplicate_flagged: boolean; intent: 'register' | 'update' }
    | { type: 'error'; text: string; duplicate?: boolean }
    | null
  >(null);
  // Existing-member ("update") state: when the ID/phone lookup finds a
  // record, the form switches to submitting an UPDATE request linked to that
  // member instead of a new registration. The lookup response is privacy-
  // minimized (name + member number only), so the applicant re-enters the
  // fields they want changed.
  const [existingMember, setExistingMember] = useState<{ id: string; member_number: string; status: string } | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'checking' | 'found' | 'not_found' | 'rate_limited'>('idle');

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Look up the applicant's existing record by ID number (falling back to
   * phone). On a match, switch the form into "update" mode — the lookup API
   * is privacy-minimized, so only the name is pre-filled.
   */
  const runLookup = async () => {
    const idNumber = formData.id_number.trim();
    const phone = formData.phone.trim();
    if (!idNumber && !phone) {
      setLookupState('not_found');
      return;
    }
    setLookupState('checking');
    try {
      const params = new URLSearchParams();
      if (idNumber) params.set('id_number', idNumber);
      else if (phone) params.set('phone', phone);
      const res = await fetch(`/api/member-registration-submissions/lookup?${params.toString()}`);
      if (res.status === 429) {
        setExistingMember(null);
        setLookupState('rate_limited');
        return;
      }
      const data = await res.json();

      if (data.success && data.data?.exists && data.data?.member) {
        const m = data.data.member as Record<string, string | null>;
        // The lookup API is deliberately minimized (privacy): it returns only
        // name + member number. Prefill those and KEEP the identifier the
        // applicant typed; the rest of the form is filled in by the applicant
        // themselves (it is their own data).
        setFormData({
          ...EMPTY_FORM,
          first_name: m.first_name ?? '',
          last_name: m.last_name ?? '',
          id_number: idNumber,
          phone,
        } as RegistrationForm);
        setExistingMember({ id: m.id as string, member_number: m.member_number as string, status: m.status as string });
        setLookupState('found');
      } else {
        setExistingMember(null);
        setLookupState('not_found');
      }
    } catch {
      setLookupState('not_found');
    }
  };

  /** Leave the existing-record pre-edit mode and go back to a fresh form. */
  const resetToNewRegistration = () => {
    setExistingMember(null);
    setLookupState('idle');
    setFormData(EMPTY_FORM);
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const payload: Record<string, unknown> = { ...formData };
      if (existingMember) {
        payload.intent = 'update';
        payload.existing_member_id = existingMember.id;
      }
      const res = await fetch('/api/member-registration-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setResult({
          type: 'success',
          reference: data.data.submission_reference,
          duplicate_flagged: data.data.duplicate_flagged,
          intent: existingMember ? 'update' : 'register',
        });
        setFormData(EMPTY_FORM);
        setExistingMember(null);
        setLookupState('idle');
      } else {
        setResult({
          type: 'error',
          text: data.error || 'Submission failed',
          duplicate: data.code === 'DUPLICATE_MEMBER',
        });
      }
    } catch {
      setResult({ type: 'error', text: 'Submission failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.type === 'success') {
    return (
      <div style={pageStyle}>
        <BrandHeader />
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48 }}>✓</div>
            <h1 style={{ color: '#0B2A4A', fontFamily: 'Georgia, serif', fontSize: 24, margin: '8px 0' }}>
              {result.intent === 'update' ? 'Your Update Request Has Been Submitted' : 'Your Information Has Been Submitted'}
            </h1>
            <p style={{ color: '#4B5563', fontSize: 14, maxWidth: 480, margin: '0 auto' }}>
              {result.intent === 'update'
                ? 'A YUNITE administrator will review and apply the changes to your existing member record.'
                : `Thank you for submitting your information to ${ORG_IDENTITY.name}.`}
            </p>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 16, margin: '20px 0', textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: '#166534' }}>
                <strong>Reference:</strong> {result.reference}
              </div>
              {result.intent === 'update' ? (
                <p style={{ fontSize: 13, color: '#166534', marginTop: 8 }}>
                  Your update is awaiting administrator approval — it updates your EXISTING member
                  record, it does not create a duplicate profile.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#166534', marginTop: 8 }}>
                    Your application is awaiting processing by YUNITE PAMOJA CBO.
                  </p>
                  <p style={{ fontSize: 13, color: '#9A3412', marginTop: 8, fontWeight: 600 }}>
                    This submission does NOT automatically make you a registered member. A YUNITE
                    administrator will review your information and complete your registration. You will
                    be contacted once your membership has been processed.
                  </p>
                  {result.duplicate_flagged && (
                    <p style={{ fontSize: 12, color: '#92400E', marginTop: 8, background: '#FEF3C7', padding: 8, borderRadius: 6 }}>
                      Note: our records show information similar to yours may already be on file. This
                      does not prevent submission — an administrator will review it.
                    </p>
                  )}
                </>
              )}
            </div>
            <button
              onClick={() => setResult(null)}
              style={buttonStyle}
            >
              Submit Another Response
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <BrandHeader />
      <div style={cardStyle}>
        <h1 style={{ color: '#0B2A4A', fontFamily: 'Georgia, serif', fontSize: 24, margin: '0 0 4px' }}>
          {existingMember ? 'Update My Member Record' : 'Member Registration Form'}
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 20px' }}>
          {existingMember
            ? `You are updating the existing record for member no. ${existingMember.member_number}. Edit the fields below and an administrator will apply your changes.`
            : 'Please provide your information below. A YUNITE administrator will review and complete your registration. Submitting this form does not automatically make you a registered member.'}
        </p>

        {existingMember && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>
              ✓ Existing record found (member no. <strong>{existingMember.member_number}</strong>, status: {existingMember.status}). For your privacy we do not display your on-file data here — please re-enter the details you want to update below and submit.
            </span>
            <button
              type="button"
              onClick={resetToNewRegistration}
              style={{ padding: '6px 12px', background: '#fff', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Start new registration
            </button>
          </div>
        )}

        {result?.type === 'error' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <div>{result.text}</div>
            {result.duplicate && (
              <button
                type="button"
                onClick={runLookup}
                style={{ marginTop: 8, padding: '6px 12px', background: '#991B1B', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
              >
                Load my existing record
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Personal Information */}
          <Section title="Personal Information">
            <Grid>
              <Field label="First Name *" required>
                <input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required className={inputClass} />
              </Field>
              <Field label="Last Name *" required>
                <input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} required className={inputClass} />
              </Field>
              <Field label="Phone *" required>
                <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} required placeholder="0712345678" className={inputClass} />
              </Field>
              <Field label="Email">
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="ID Number">
                <input type="text" name="id_number" value={formData.id_number} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="&nbsp;">
                <button
                  type="button"
                  onClick={runLookup}
                  disabled={lookupState === 'checking'}
                  style={{ padding: '9px 14px', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {lookupState === 'checking' ? 'Checking…' : 'Already registered? Find my record'}
                </button>
                {lookupState === 'not_found' && (
                  <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    No existing record for this ID/phone — continue as a new registration.
                  </p>
                )}
                {lookupState === 'rate_limited' && (
                  <p style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>
                    Too many lookup attempts — please wait a minute and try again.
                  </p>
                )}
              </Field>
              <Field label="KRA PIN">
                <input type="text" name="kra_pin" value={formData.kra_pin} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Date of Birth">
                <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Gender">
                <select name="gender" value={formData.gender} onChange={handleInputChange} className={inputClass}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Marital Status">
                <select name="marital_status" value={formData.marital_status} onChange={handleInputChange} className={inputClass}>
                  <option value="">Select</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </Field>
              <Field label="Nationality">
                <input type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} placeholder="e.g. Kenyan" className={inputClass} />
              </Field>
            </Grid>
          </Section>

          {/* Contact Information */}
          <Section title="Contact Information">
            <Grid>
              <Field label="Physical Address" full>
                <input type="text" name="physical_address" value={formData.physical_address} onChange={handleInputChange} placeholder="e.g. Nairobi, Kariobangi" className={inputClass} />
              </Field>
              <Field label="Postal Address">
                <input type="text" name="postal_address" value={formData.postal_address} onChange={handleInputChange} placeholder="e.g. 00100" className={inputClass} />
              </Field>
              <Field label="Alt. Phone">
                <input type="tel" name="alt_phone" value={formData.alt_phone} onChange={handleInputChange} placeholder="0712345678" className={inputClass} />
              </Field>
              <Field label="Alt. Email">
                <input type="email" name="alt_email" value={formData.alt_email} onChange={handleInputChange} className={inputClass} />
              </Field>
            </Grid>
          </Section>

          {/* Employment Information */}
          <Section title="Employment Information">
            <Grid>
              <Field label="Occupation">
                <input type="text" name="occupation" value={formData.occupation} onChange={handleInputChange} placeholder="e.g. Barista" className={inputClass} />
              </Field>
              <Field label="Employer">
                <input type="text" name="employer" value={formData.employer} onChange={handleInputChange} placeholder="e.g. Self Employed" className={inputClass} />
              </Field>
              <Field label="Employer Address" full>
                <input type="text" name="employer_address" value={formData.employer_address} onChange={handleInputChange} className={inputClass} />
              </Field>
            </Grid>
          </Section>

          {/* Next of Kin */}
          <Section title="Next of Kin">
            <Grid>
              <Field label="Name">
                <input type="text" name="next_of_kin_name" value={formData.next_of_kin_name} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input type="tel" name="next_of_kin_phone" value={formData.next_of_kin_phone} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Relationship">
                <input type="text" name="next_of_kin_relationship" value={formData.next_of_kin_relationship} onChange={handleInputChange} placeholder="Spouse, Parent..." className={inputClass} />
              </Field>
            </Grid>
          </Section>

          {/* Emergency Contact */}
          <Section title="Emergency Contact">
            <Grid>
              <Field label="Name">
                <input type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input type="tel" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange} className={inputClass} />
              </Field>
              <Field label="Relationship">
                <input type="text" name="emergency_contact_relationship" value={formData.emergency_contact_relationship} onChange={handleInputChange} placeholder="e.g. Spouse, Parent, Sibling" className={inputClass} />
              </Field>
            </Grid>
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
            <button type="submit" disabled={submitting} style={{ ...buttonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting
                ? 'Submitting...'
                : existingMember
                  ? `Submit Update for Member ${existingMember.member_number}`
                  : 'Submit Registration Information'}
            </button>
          </div>
        </form>
      </div>
      <Footer />
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'Arial, Helvetica, sans-serif',
  background: '#F8FAFC',
  color: '#1F2937',
  minHeight: '100vh',
};
const cardStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '16px auto',
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
  padding: 28,
};
const buttonStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: '#0B2A4A',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 14,
};

function BrandHeader() {
  // Resolve the active organization logo from the Media Engine
  // (GET /api/media/organization/org/ORGANIZATION_LOGO is public for org
  // branding). When the org has a logo set, it renders here and updates
  // automatically whenever the logo changes — no code change needed. Falls
  // back to the "YP" monogram only when no logo is configured.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoErrored, setLogoErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/media/organization/org/ORGANIZATION_LOGO')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setLogoUrl(data?.url ?? null); })
      .catch(() => { if (!cancelled) setLogoUrl(null); });
    return () => { cancelled = true; };
  }, []);

  const showLogo = logoUrl && !logoErrored;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '16px 0 0' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl ?? undefined}
              alt={`${ORG_IDENTITY.name} logo`}
              onError={() => setLogoErrored(true)}
              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain', border: '1px solid #E5E7EB' }}
            />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'linear-gradient(135deg,#0B2A4A,#22C55E)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>
              YP
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0B2A4A' }}>{ORG_IDENTITY.name}</div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>{ORG_IDENTITY.tagline} · {ORG_IDENTITY.city}, {ORG_IDENTITY.country}</div>
          </div>
        </div>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#0B2A4A 0%,#0B2A4A 62%,#22C55E 62%,#22C55E 100%)' }} />
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11, padding: '24px 0' }}>
      {ORG_IDENTITY.copyright}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: '0 0 12px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>{children}</div>;
}

function Field({
  label,
  children,
  full,
  required,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  required?: boolean;
}) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ display: 'block', ...labelStyleObject }}>{label}</label>
      {children}
    </div>
  );
}

const labelStyleObject: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 4,
};
