'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Card, SectionTitle } from '@/components/dashboard/ui';

interface OrgInfo { name?: string; phone?: string; email?: string; address?: string; }

export default function SupportPage() {
  const [org, setOrg] = useState<OrgInfo>({});

  useEffect(() => {
    fetch('/api/org-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setOrg(d.data); })
      .catch(() => {});
  }, []);

  return (
    <>
      <PageHeader title="Support" subtitle="How to get help with your membership." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Contact the YUNITE office</SectionTitle>
          <dl className="space-y-3 text-sm">
            <Row k="Organisation" v={org.name || 'YUNITE Pamoja CBO'} />
            <Row k="Phone" v={org.phone || '—'} />
            <Row k="Email" v={org.email || '—'} />
            <Row k="Address" v={org.address || '—'} />
          </dl>
          <p className="mt-4 text-xs text-white/45">
            The office can help with balance disputes, statement certification, detail updates, and loan enquiries.
          </p>
        </Card>

        <Card>
          <SectionTitle>Common questions</SectionTitle>
          <ul className="space-y-3 text-sm text-white/70">
            <Faq q="Why can't I edit my details here?" a="For your security, profile changes are made through the office to verify identity first." />
            <Faq q="How are my shares calculated?" a="Shares are derived from your savings (approximately 1 share per KES 100 saved). See the Savings & Shares page." />
            <Faq q="Where do I pay contributions?" a="Monthly contributions and welfare deposits are made through the YUNITE office or the official payment channels." />
            <Faq q="How do I apply for a loan?" a="Loan applications are handled by the office for active members in good standing." />
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle>Submit a request</SectionTitle>
        <p className="text-sm text-white/60">
          An online support-ticket system is not yet connected to this portal. To raise an issue, please
          contact the office directly using the details above, and include your member number for the
          fastest response.
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
          We are working to bring in-app support tickets to the member portal soon.
        </div>
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-white/50">{k}</dt>
      <dd className="font-medium text-white">{v}</dd>
    </div>
  );
}
function Faq({ q, a }: { q: string; a: string }) {
  return (
    <li>
      <div className="font-medium text-white/85">{q}</div>
      <div className="mt-0.5 text-white/55">{a}</div>
    </li>
  );
}
