'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Notification {
  id: string;
  notification_ref: string;
  subject: string;
  body: string;
  priority: string;
  recipient_name: string;
  recipient_email: string;
  status: string;
  source_module: string;
  source_action: string;
  created_at: string;
  read_at: string | null;
}

interface Template {
  id: string;
  template_code: string;
  name: string;
  description: string;
  category: { id: string; name: string; color: string } | null;
  priority: string;
  is_active: boolean;
}

interface Schedule {
  id: string;
  schedule_code: string;
  name: string;
  description: string;
  schedule_type: string;
  scheduled_time: string;
  is_active: boolean;
  next_run_at: string | null;
  template: { template_code: string; name: string } | null;
}

interface EmailQueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [emailStats, setEmailStats] = useState<EmailQueueStats | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  
  const [composeForm, setComposeForm] = useState({
    recipient_type: 'all_admins',
    subject: '',
    body: '',
    priority: 'normal',
    channels: ['in_app'],
  });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const emailRes = await fetch('/api/notifications/email?action=stats');
      const emailData = await emailRes.json();
      if (emailData.success) {
        setEmailStats(emailData.data);
        setTotalSent(emailData.data.sent || 0);
        setTotalFailed(emailData.data.failed || 0);
      }

      const notificationsRes = await fetch('/api/notifications');
      const notificationsData = await notificationsRes.json();
      if (notificationsData.success) {
        setNotifications(notificationsData.data || []);
      }

      const templatesRes = await fetch('/api/notifications/templates');
      const templatesData = await templatesRes.json();
      if (templatesData.success) {
        setTemplates(templatesData.data || []);
      }

      const schedulesRes = await fetch('/api/notifications/schedules');
      const schedulesData = await schedulesRes.json();
      if (schedulesData.success) {
        setSchedules(schedulesData.data || []);
      }

      setUnreadCount(2);
    } catch (error) {
      console.error('Failed to fetch notification data:', error);
    }
    setLoading(false);
  };

  const handleSendNotification = async () => {
    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...composeForm,
          recipient_type: composeForm.recipient_type,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setSendResult({ success: true, message: 'Notification sent successfully!' });
        setComposeForm({
          recipient_type: 'all_admins',
          subject: '',
          body: '',
          priority: 'normal',
          channels: ['in_app'],
        });
        fetchData();
      } else {
        setSendResult({ success: false, message: data.error || 'Failed to send notification' });
      }
    } catch (error) {
      setSendResult({ success: false, message: 'Failed to send notification' });
    }
    setSending(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_all_read',
          recipient_id: 'admin',
          recipient_type: 'user',
        }),
      });
      setUnreadCount(0);
      fetchData();
    } catch (error) {
      console.error('Failed to mark all as read');
    }
  };

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🔔 Notifications</h1>
          <p className="text-gray-600 mt-1">Manage notifications, templates, and schedules</p>
        </div>
        <button
          onClick={() => setActiveTab('compose')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <span>✏️</span> Compose Notification
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Unread</p>
              <p className="text-3xl font-bold text-gray-900">{unreadCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">🔔</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Sent</p>
              <p className="text-3xl font-bold text-gray-900">{totalSent}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">✅</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Email Queue</p>
              <p className="text-3xl font-bold text-gray-900">{emailStats?.pending || 0}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-2xl">📧</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Failed</p>
              <p className="text-3xl font-bold text-gray-900">{totalFailed}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl">❌</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow">
        <div className="border-b">
          <div className="flex gap-1 px-4">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'history', label: 'History', icon: '📋' },
              { id: 'templates', label: 'Templates', icon: '📝' },
              { id: 'schedules', label: 'Schedules', icon: '⏰' },
              { id: 'email', label: 'Email Queue', icon: '📧' },
              { id: 'compose', label: 'Compose', icon: '✏️' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Notifications</h2>
                <button onClick={handleMarkAllRead} className="text-sm text-indigo-600 hover:text-indigo-800">
                  Mark all as read
                </button>
              </div>
              
              <div className="space-y-3">
                {notifications.slice(0, 5).map((notification) => (
                  <div key={notification.id} className="p-4 rounded-lg border bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">{notification.subject}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                            {notification.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{notification.body}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>📅 {formatDate(notification.created_at)}</span>
                          <span>📁 {notification.source_module}</span>
                          <span className={getStatusColor(notification.status)}>
                            {notification.status === 'read' ? '✓ Read' : notification.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {notifications.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-4">🔔</div>
                  <p>No notifications yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Notification History</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Notification</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Recipient</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Priority</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((notification) => (
                      <tr key={notification.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{notification.subject}</p>
                          <p className="text-sm text-gray-500">{notification.notification_ref}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm">{notification.recipient_name}</p>
                          <p className="text-xs text-gray-500">{notification.recipient_email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                            {notification.priority}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-medium ${getStatusColor(notification.status)}`}>
                          {notification.status}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {formatDate(notification.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {notifications.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>No notification history</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'templates' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Notification Templates</h2>
                <Link href="/dashboard/notifications/templates" className="text-sm text-indigo-600 hover:text-indigo-800">
                  View All →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.length > 0 ? templates.map((template) => (
                  <div key={template.id} className="p-4 border rounded-lg hover:border-indigo-300 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{template.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{template.description}</p>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{template.template_code}</code>
                  </div>
                )) : (
                  <div className="col-span-2 text-center py-8 text-gray-500">
                    <div className="text-4xl mb-4">📝</div>
                    <p>No templates configured</p>
                    <p className="text-sm">Run database migration to create templates</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'schedules' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Scheduled Notifications</h2>
                <Link href="/dashboard/notifications/schedules" className="text-sm text-indigo-600 hover:text-indigo-800">
                  Manage Schedules →
                </Link>
              </div>
              <div className="space-y-3">
                {schedules.length > 0 ? schedules.map((schedule) => (
                  <div key={schedule.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{schedule.name}</h3>
                        <p className="text-sm text-gray-500">{schedule.description}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${schedule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {schedule.schedule_type} {schedule.scheduled_time && `at ${schedule.scheduled_time}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">⏰</div>
                    <p>No scheduled notifications</p>
                    <p className="text-sm">Create schedules to automate notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Email Queue Status</h2>
                <button
                  onClick={async () => {
                    await fetch('/api/notifications/email?action=process', { method: 'POST' });
                    fetchData();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                  Process Queue
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-600">{emailStats?.pending || 0}</p>
                  <p className="text-sm text-gray-600">Pending</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{emailStats?.processing || 0}</p>
                  <p className="text-sm text-gray-600">Processing</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{emailStats?.sent || 0}</p>
                  <p className="text-sm text-gray-600">Sent</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{emailStats?.failed || 0}</p>
                  <p className="text-sm text-gray-600">Failed</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compose' && (
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold mb-4">Compose Notification</h2>
              
              {sendResult && (
                <div className={`mb-4 p-4 rounded-lg ${sendResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {sendResult.message}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Type</label>
                  <select
                    value={composeForm.recipient_type}
                    onChange={(e) => setComposeForm({ ...composeForm, recipient_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all_admins">All Administrators</option>
                    <option value="member">Specific Member</option>
                    <option value="user">Specific User</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                    placeholder="Enter notification subject..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={composeForm.body}
                    onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                    placeholder="Enter notification message..."
                    rows={6}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={composeForm.priority}
                      onChange={(e) => setComposeForm({ ...composeForm, priority: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSendNotification}
                    disabled={sending || !composeForm.subject || !composeForm.body}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? 'Sending...' : 'Send Notification'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
