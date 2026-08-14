'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/components/dashboard/useApi';
import { Card, EmptyState, ErrorState, Loading, PageHeader } from '@/components/dashboard/ui';
import { formatDateTime } from '@/lib/format';
import type { Notification } from '@/lib/api/types';

export default function NotificationsPage() {
  const router = useRouter();
  const { data, loading, error, reconnecting, reload } = useApi<Notification[]>('/api/member/notifications', () => router.replace('/#access'));

  if (reconnecting) return <Loading label="Connecting to YUNITE…" />;
  if (loading) return <Loading label="Loading your notifications…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const items = data || [];
  return (
    <>
      <PageHeader title="Notifications" subtitle="Messages and updates from YUNITE." />
      {items.length === 0 ? (
        <EmptyState title="No notifications" body="Messages from YUNITE will appear here." icon="🔔" />
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const subject = n.subject || n.title || '(No subject)';
            const body = n.body || n.message || '';
            return (
              <Card key={n.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{subject}</div>
                    {body && <p className="mt-1 whitespace-pre-line text-sm text-white/70">{body}</p>}
                  </div>
                  <div className="shrink-0 text-xs text-white/45">{formatDateTime(n.created_at)}</div>
                </div>
                {n.priority && (
                  <div className="mt-2">
                    <span className={`pill ${n.priority === 'urgent' || n.priority === 'high' ? 'status-suspended' : 'status-pending'}`}>
                      {n.priority}
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
