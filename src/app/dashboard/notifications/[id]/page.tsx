'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface Notification {
  id: string;
  notification_ref: string;
  subject: string;
  body: string;
  priority: string;
  recipient_name: string;
  recipient_email: string;
  recipient_type: string;
  status: string;
  source_module: string;
  source_action: string;
  source_entity_type: string;
  source_entity_id: string;
  template_code: string;
  category_id: string;
  rendered_variables: Record<string, unknown>;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  actor_name: string;
}

export default function NotificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id ?? '') as string;

  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        // mark_read=true marks it read in the same request so opening it
        // automatically clears it from the unread bell count.
        const res = await fetch(`/api/notifications/${id}?mark_read=true`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.success) {
          setError(data?.error || 'Failed to load notification');
        } else {
          setNotification(data.data);
        }
      } catch {
        if (active) setError('Failed to load notification');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [id]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'text-blue-600';
      case 'delivered': return 'text-green-600';
      case 'read': return 'text-gray-600';
      case 'failed': return 'text-red-600';
      case 'pending': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading notification...</p>
        </div>
      </div>
    );
  }

  if (error || !notification) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link href="/dashboard/notifications" className="text-indigo-600 hover:text-indigo-800 text-sm mb-4 inline-block">
          ← Back to notifications
        </Link>
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          <div className="text-4xl mb-4">🔔</div>
          <p>{error || 'Notification not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href="/dashboard/notifications" className="text-indigo-600 hover:text-indigo-800 text-sm">
          ← Back to notifications
        </Link>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-500 to-purple-600">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-white break-words">
                {notification.subject || '(no subject)'}
              </h1>
              <p className="text-sm text-white/80 mt-1">
                {notification.notification_ref}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                {notification.priority}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-medium bg-white/90 ${getStatusColor(notification.status)}`}>
                {notification.status}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Full body content — the core of "view a notification" */}
          <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap break-words">
            {notification.body || '(no content)'}
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t pt-6">
            <div>
              <p className="text-gray-500">Recipient</p>
              <p className="font-medium text-gray-900">{notification.recipient_name || '—'}</p>
              <p className="text-gray-500">{notification.recipient_email || notification.recipient_type}</p>
            </div>
            <div>
              <p className="text-gray-500">Created</p>
              <p className="font-medium text-gray-900">{formatDate(notification.created_at)}</p>
            </div>
            <div>
              <p className="text-gray-500">Source</p>
              <p className="font-medium text-gray-900 capitalize">
                {notification.source_module || '—'}
                {notification.source_action ? ` · ${notification.source_action}` : ''}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Template</p>
              <p className="font-medium text-gray-900">{notification.template_code || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Sent at</p>
              <p className="font-medium text-gray-900">{formatDate(notification.sent_at)}</p>
            </div>
            <div>
              <p className="text-gray-500">Read at</p>
              <p className="font-medium text-gray-900">{formatDate(notification.read_at)}</p>
            </div>
          </div>

          {notification.rendered_variables && Object.keys(notification.rendered_variables).length > 0 && (
            <details className="mt-6 group">
              <summary className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-800">
                View variables
              </summary>
              <pre className="mt-3 p-4 bg-gray-50 rounded-lg text-xs text-gray-700 overflow-x-auto">
                {JSON.stringify(notification.rendered_variables, null, 2)}
              </pre>
            </details>
          )}

          <div className="mt-8 flex gap-3">
            <Link
              href="/dashboard/notifications"
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700"
            >
              Back to list
            </Link>
            {notification.status !== 'read' && (
              <span className="px-4 py-2 rounded-lg bg-blue-50 text-sm text-blue-700">
                ✓ Marked as read
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
