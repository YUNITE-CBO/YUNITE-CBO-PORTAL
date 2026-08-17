'use client';

import { useState } from 'react';
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
    | { type: 'success'; reference: string; duplicate_flagged: boolean }
    | { type: 'error'; text: string }
    | null
  >(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/member-registration-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setResult({
          type: 'success',
          reference: data.data.submission_reference,
          duplicate_flagged: data.data.duplicate_flagged,
        });
        setFormData(EMPTY_FORM);
      } else {
        setResult({ type: 'error', text: data.error || 'Submission failed' });
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
              Your Information Has Been Submitted
            </h1>
            <p style={{ color: '#4B5563', fontSize: 14, maxWidth: 480, margin: '0 auto' }}>
              Thank you for submitting your information to {ORG_IDENTITY.name}.
            </p>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 16, margin: '20px 0', textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: '#166534' }}>
                <strong>Reference:</strong> {result.reference}
              </div>
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
          Member Registration Form
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 20px' }}>
          Please provide your information below. A YUNITE administrator will review and complete your
          registration. Submitting this form does not automatically make you a registered member.
        </p>

        {result?.type === 'error' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {result.text}
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
              {submitting ? 'Submitting...' : 'Submit Registration Information'}
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
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '16px 0 0' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: 'linear-gradient(135deg,#0B2A4A,#22C55E)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>
            YP
          </div>
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
