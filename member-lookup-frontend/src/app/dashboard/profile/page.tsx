'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, ErrorState, Loading, PageHeader, Pill, SectionTitle } from '@/components/dashboard/ui';
import { formatDate } from '@/lib/format';
import type { Member } from '@/lib/api/types';

interface OverviewData { member: Member | null; }

export default function ProfilePage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<OverviewData>('/api/member/overview', () => router.replace('/#access'));

  if (loading) return <Loading label="Loading your profile…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const m = data?.member;

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your registered membership details." action={m ? <Pill status={m.status} /> : null} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Personal information</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Member number" v={m?.member_number || '—'} />
            <Row k="Full name" v={m ? `${m.first_name} ${m.last_name}` : '—'} />
            <Row k="Phone" v={m?.phone || '—'} />
            <Row k="Email" v={m?.email || '—'} />
            <Row k="ID number" v={mask(m?.id_number)} />
            <Row k="Date of birth" v={m?.date_of_birth ? formatDate(m.date_of_birth) : '—'} />
            <Row k="Gender" v={m?.gender || '—'} />
          </dl>
        </Card>

        <Card>
          <SectionTitle>Address & employment</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Physical address" v={m?.physical_address || '—'} />
            <Row k="Postal address" v={m?.postal_address || '—'} />
            <Row k="Occupation" v={m?.occupation || '—'} />
            <Row k="Employer" v={m?.employer || '—'} />
            <Row k="Employer address" v={m?.employer_address || '—'} />
          </dl>
        </Card>

        <Card>
          <SectionTitle>Next of kin</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Name" v={m?.next_of_kin_name || '—'} />
            <Row k="Phone" v={m?.next_of_kin_phone || '—'} />
            <Row k="Relationship" v={m?.next_of_kin_relationship || '—'} />
          </dl>
        </Card>

        <Card>
          <SectionTitle>Membership</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Registered on" v={m?.registration_date ? formatDate(m.registration_date) : '—'} />
            <Row k="Status" v={m ? <Pill status={m.status} /> : '—'} />
            <Row k="Preferred contact" v={m?.preferred_contact_method || '—'} />
            <Row k="SMS notifications" v={m?.sms_notifications ? 'On' : 'Off'} />
          </dl>
        </Card>
      </div>

      <p className="mt-4 text-xs text-white/40">
        To update your details, please contact the YUNITE office. For your security, profile editing is not available from the public portal.
      </p>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-white/50">{k}</dt>
      <dd className="text-right font-medium text-white">{v}</dd>
    </div>
  );
}
function mask(v?: string | null): string {
  if (!v) return '—';
  if (v.length <= 3) return v;
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}
