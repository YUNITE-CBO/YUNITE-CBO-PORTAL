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

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface SelectedRecipient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: 'member' | 'user';
  member_number?: string;
  hasEmail: boolean;
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

  // Recipient selection state
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showBulkMemberPicker, setShowBulkMemberPicker] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Validation state
  const [validationResult, setValidationResult] = useState<{
    total: number;
    withEmail: number;
    withoutEmail: number;
    excluded: { id: string; name: string; reason: string }[];
  } | null>(null);

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

  // Search members
  const searchMembers = async (query: string) => {
    if (query.length < 2) {
      setMemberSearchResults([]);
      return;
    }

    setSearchingMembers(true);
    try {
      const res = await fetch(`/api/members?query=${encodeURIComponent(query)}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setMemberSearchResults(data.data || []);
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    }
    setSearchingMembers(false);
  };

  // Search users (need to create this API)
  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setUserSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const res = await fetch(`/api/users?query=${encodeURIComponent(query)}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setUserSearchResults(data.data || []);
      }
    } catch (error) {
      console.error('Failed to search users:', error);
    }
    setSearchingUsers(false);
  };

  // Add single member as recipient
  const addMemberAsRecipient = (member: Member) => {
    const recipient: SelectedRecipient = {
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      email: member.email,
      phone: member.phone,
      type: 'member',
      member_number: member.member_number,
      hasEmail: !!member.email,
    };
    setSelectedRecipients([recipient]);
    setShowMemberPicker(false);
    setMemberSearch('');
    setMemberSearchResults([]);
    validateRecipients([recipient]);
  };

  // Add single user as recipient
  const addUserAsRecipient = (user: User) => {
    const recipient: SelectedRecipient = {
      id: user.id,
      name: user.full_name,
      email: user.email,
      phone: null,
      type: 'user',
      hasEmail: !!user.email,
    };
    setSelectedRecipients([recipient]);
    setShowUserPicker(false);
    validateRecipients([recipient]);
  };

  // Add multiple members as recipients
  const addBulkMembersAsRecipients = (members: Member[]) => {
    const recipients: SelectedRecipient[] = members.map(member => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      email: member.email,
      phone: member.phone,
      type: 'member',
      member_number: member.member_number,
      hasEmail: !!member.email,
    }));
    setSelectedRecipients(recipients);
    setShowBulkMemberPicker(false);
    setMemberSearch('');
    setMemberSearchResults([]);
    validateRecipients(recipients);
  };

  // Remove recipient
  const removeRecipient = (id: string) => {
    const updated = selectedRecipients.filter(r => r.id !== id);
    setSelectedRecipients(updated);
    validateRecipients(updated);
  };

  // Validate recipients for email delivery
  const validateRecipients = (recipients: SelectedRecipient[]) => {
    const withEmail = recipients.filter(r => r.hasEmail);
    const withoutEmail = recipients.filter(r => !r.hasEmail);
    
    setValidationResult({
      total: recipients.length,
      withEmail: withEmail.length,
      withoutEmail: withoutEmail.length,
      excluded: withoutEmail.map(r => ({
        id: r.id,
        name: r.name,
        reason: r.type === 'member' ? 'No email address on profile' : 'No email address on user account',
      })),
    });
  };

  // Check if email can be sent
  const canSendEmail = () => {
    if (composeForm.recipient_type === 'all_admins' || composeForm.recipient_type === 'system') {
      return true;
    }
    if (composeForm.channels.includes('email')) {
      return validationResult && validationResult.withEmail > 0;
    }
    return true;
  };

  const handleSendNotification = async () => {
    setSending(true);
    setSendResult(null);

    try {
      // Build recipient data based on type
      let recipientData: any = {
        ...composeForm,
      };

      if (composeForm.recipient_type === 'member' && selectedRecipients.length > 0) {
        const recipient = selectedRecipients[0];
        recipientData.recipient_id = recipient.id;
        recipientData.recipient_email = recipient.email;
        recipientData.recipient_name = recipient.name;
      } else if (composeForm.recipient_type === 'user' && selectedRecipients.length > 0) {
        const recipient = selectedRecipients[0];
        recipientData.recipient_id = recipient.id;
        recipientData.recipient_email = recipient.email;
        recipientData.recipient_name = recipient.name;
      } else if (composeForm.recipient_type === 'bulk_members') {
        recipientData.recipients = selectedRecipients.map(r => ({
          id: r.id,
          email: r.email,
          name: r.name,
          hasEmail: r.hasEmail,
        }));
        recipientData.recipient_email = selectedRecipients.filter(r => r.hasEmail).map(r => r.email);
      }

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipientData),
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
        setSelectedRecipients([]);
        setValidationResult(null);
        fetchData();
      } else {
        setSendResult({ success: false, message: data.error || 'Failed to send notification' });
      }
    } catch (error) {
      setSendResult({ success: false, message: 'Failed to send notification' });
    }
    setSending(false);
  };

  const handleRecipientTypeChange = (type: string) => {
    setComposeForm({ ...composeForm, recipient_type: type });
    setSelectedRecipients([]);
    setValidationResult(null);
    
    if (type === 'member') {
      setShowMemberPicker(true);
    } else if (type === 'user') {
      setShowUserPicker(true);
    } else if (type === 'bulk_members') {
      setShowBulkMemberPicker(true);
    }
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
            <div className="max-w-3xl">
              <h2 className="text-lg font-semibold mb-4">✏️ Compose Notification</h2>
              
              {sendResult && (
                <div className={`mb-4 p-4 rounded-lg ${sendResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {sendResult.message}
                </div>
              )}

              <div className="space-y-6">
                {/* Recipient Selection */}
                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-3">👥 Recipients</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Type</label>
                      <select
                        value={composeForm.recipient_type}
                        onChange={(e) => handleRecipientTypeChange(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="all_admins">All Administrators</option>
                        <option value="member">Specific Member</option>
                        <option value="user">Specific User</option>
                        <option value="bulk_members">Multiple Members</option>
                        <option value="system">System</option>
                      </select>
                    </div>
                  </div>

                  {/* Specific Member Selection */}
                  {(composeForm.recipient_type === 'member') && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-blue-900">Select Member</span>
                        <button
                          onClick={() => setShowMemberPicker(true)}
                          className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                        >
                          🔍 Search Members
                        </button>
                      </div>
                      {selectedRecipients.length > 0 && (
                        <div className="mt-2 p-3 bg-white rounded-lg border">
                          {selectedRecipients.map(recipient => (
                            <div key={recipient.id} className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{recipient.name}</p>
                                <p className="text-sm text-gray-500">{recipient.member_number}</p>
                                {recipient.hasEmail ? (
                                  <p className="text-sm text-green-600">✓ {recipient.email}</p>
                                ) : (
                                  <p className="text-sm text-red-600">⚠️ No email on profile</p>
                                )}
                              </div>
                              <button
                                onClick={() => removeRecipient(recipient.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!selectedRecipients.length && (
                        <p className="text-sm text-gray-500">Click "Search Members" to select a recipient</p>
                      )}
                    </div>
                  )}

                  {/* Specific User Selection */}
                  {(composeForm.recipient_type === 'user') && (
                    <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-purple-900">Select User</span>
                        <button
                          onClick={() => setShowUserPicker(true)}
                          className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                        >
                          🔍 Search Users
                        </button>
                      </div>
                      {selectedRecipients.length > 0 && (
                        <div className="mt-2 p-3 bg-white rounded-lg border">
                          {selectedRecipients.map(recipient => (
                            <div key={recipient.id} className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{recipient.name}</p>
                                {recipient.hasEmail ? (
                                  <p className="text-sm text-green-600">✓ {recipient.email}</p>
                                ) : (
                                  <p className="text-sm text-red-600">⚠️ No email on profile</p>
                                )}
                              </div>
                              <button
                                onClick={() => removeRecipient(recipient.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!selectedRecipients.length && (
                        <p className="text-sm text-gray-500">Click "Search Users" to select a recipient</p>
                      )}
                    </div>
                  )}

                  {/* Multiple Members Selection */}
                  {(composeForm.recipient_type === 'bulk_members') && (
                    <div className="mt-4 p-4 bg-green-50 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-green-900">Select Multiple Members</span>
                        <button
                          onClick={() => setShowBulkMemberPicker(true)}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                        >
                          🔍 Search & Select Members
                        </button>
                      </div>
                      {selectedRecipients.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto">
                          {selectedRecipients.map(recipient => (
                            <div key={recipient.id} className="flex items-center justify-between p-2 bg-white rounded-lg border mb-2">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 text-sm">{recipient.name}</p>
                                <p className="text-xs text-gray-500">{recipient.member_number}</p>
                              </div>
                              {recipient.hasEmail ? (
                                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">✓ Email</span>
                              ) : (
                                <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">⚠️ No Email</span>
                              )}
                              <button
                                onClick={() => removeRecipient(recipient.id)}
                                className="ml-2 text-red-600 hover:text-red-800"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!selectedRecipients.length && (
                        <p className="text-sm text-gray-500">Click "Search & Select Members" to choose recipients</p>
                      )}
                    </div>
                  )}

                  {/* Validation Summary for Bulk */}
                  {validationResult && composeForm.recipient_type === 'bulk_members' && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <h4 className="font-medium text-gray-900 mb-2">📊 Recipient Summary</h4>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center p-2 bg-white rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{validationResult.total}</p>
                          <p className="text-xs text-gray-500">Total Selected</p>
                        </div>
                        <div className="text-center p-2 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">{validationResult.withEmail}</p>
                          <p className="text-xs text-gray-500">Will Receive Email</p>
                        </div>
                        <div className="text-center p-2 bg-red-50 rounded-lg">
                          <p className="text-2xl font-bold text-red-600">{validationResult.withoutEmail}</p>
                          <p className="text-xs text-gray-500">Without Email</p>
                        </div>
                      </div>
                      {validationResult.excluded.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-red-700 mb-2">⚠️ Recipients without email (will be skipped):</p>
                          <ul className="text-sm text-red-600 space-y-1">
                            {validationResult.excluded.map(ex => (
                              <li key={ex.id}>• {ex.name} - {ex.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Email Channel Warning */}
                {composeForm.channels.includes('email') && composeForm.recipient_type !== 'all_admins' && composeForm.recipient_type !== 'system' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    {selectedRecipients.length === 0 ? (
                      <p className="text-yellow-800">👆 Please select recipients first to see email availability</p>
                    ) : validationResult && validationResult.withEmail === 0 ? (
                      <div className="text-yellow-800">
                        <p className="font-medium">⚠️ No recipients have email addresses</p>
                        <p className="text-sm">Select "In-App Only" notification or add emails to member profiles</p>
                      </div>
                    ) : validationResult && validationResult.withoutEmail > 0 ? (
                      <div className="text-yellow-800">
                        <p className="font-medium">ℹ️ {validationResult.withoutEmail} recipient(s) will not receive email</p>
                        <p className="text-sm">Only members with email addresses will receive the email notification</p>
                      </div>
                    ) : (
                      <p className="text-green-800">✓ All selected recipients have email addresses</p>
                    )}
                  </div>
                )}

                {/* Message Content */}
                <div className="bg-white border rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-3">📝 Message Content</h3>
                  
                  <div className="space-y-4">
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Channels</label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={composeForm.channels.includes('in_app')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setComposeForm({ ...composeForm, channels: [...composeForm.channels, 'in_app'] });
                                } else {
                                  setComposeForm({ ...composeForm, channels: composeForm.channels.filter(c => c !== 'in_app') });
                                }
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span className="text-sm">In-App</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={composeForm.channels.includes('email')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setComposeForm({ ...composeForm, channels: [...composeForm.channels, 'email'] });
                                } else {
                                  setComposeForm({ ...composeForm, channels: composeForm.channels.filter(c => c !== 'email') });
                                }
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span className="text-sm">Email</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-4">
                  <button
                    onClick={() => {
                      setComposeForm({
                        recipient_type: 'all_admins',
                        subject: '',
                        body: '',
                        priority: 'normal',
                        channels: ['in_app'],
                      });
                      setSelectedRecipients([]);
                      setValidationResult(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSendNotification}
                    disabled={sending || !composeForm.subject || !composeForm.body || (selectedRecipients.length === 0 && ['member', 'user', 'bulk_members'].includes(composeForm.recipient_type))}
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

      {/* Member Picker Modal */}
      {showMemberPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Select Member</h2>
              <button onClick={() => setShowMemberPicker(false)} className="text-gray-400 hover:text-gray-600 text-2xl">
                ×
              </button>
            </div>
            <div className="p-6">
              <input
                type="text"
                placeholder="Search by name, member number, or phone..."
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  searchMembers(e.target.value);
                }}
                className="w-full px-4 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchingMembers && (
                  <div className="text-center py-4 text-gray-500">Searching...</div>
                )}
                {!searchingMembers && memberSearchResults.length === 0 && memberSearch.length >= 2 && (
                  <div className="text-center py-4 text-gray-500">No members found</div>
                )}
                {memberSearchResults.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => addMemberAsRecipient(member)}
                    className="w-full text-left p-4 border rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="text-sm text-gray-500">{member.member_number}</p>
                      </div>
                      <div className="text-right">
                        {member.email ? (
                          <span className="text-sm text-green-600">✓ {member.email}</span>
                        ) : (
                          <span className="text-sm text-red-500">⚠️ No email</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Picker Modal */}
      {showUserPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Select User</h2>
              <button onClick={() => {
                setShowUserPicker(false);
                setUserSearch('');
                setUserSearchResults([]);
              }} className="text-gray-400 hover:text-gray-600 text-2xl">
                ×
              </button>
            </div>
            <div className="p-6">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  searchUsers(e.target.value);
                }}
                className="w-full px-4 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchingUsers && (
                  <div className="text-center py-4 text-gray-500">Searching...</div>
                )}
                {!searchingUsers && userSearchResults.length === 0 && userSearch.length >= 2 && (
                  <div className="text-center py-4 text-gray-500">No users found</div>
                )}
                {userSearchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => addUserAsRecipient(user)}
                    className="w-full text-left p-4 border rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">{user.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Member Picker Modal */}
      {showBulkMemberPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Select Multiple Members</h2>
              <button onClick={() => setShowBulkMemberPicker(false)} className="text-gray-400 hover:text-gray-600 text-2xl">
                ×
              </button>
            </div>
            <div className="p-6">
              <input
                type="text"
                placeholder="Search by name, member number, or phone..."
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  searchMembers(e.target.value);
                }}
                className="w-full px-4 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {searchingMembers && (
                  <div className="text-center py-4 text-gray-500">Searching...</div>
                )}
                {!searchingMembers && memberSearchResults.length === 0 && memberSearch.length >= 2 && (
                  <div className="text-center py-4 text-gray-500">No members found</div>
                )}
                {memberSearchResults.map((member) => {
                  const isSelected = selectedRecipients.some(r => r.id === member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        if (!isSelected) {
                          const newRecipients = [...selectedRecipients, {
                            id: member.id,
                            name: `${member.first_name} ${member.last_name}`,
                            email: member.email,
                            phone: member.phone,
                            type: 'member' as const,
                            member_number: member.member_number,
                            hasEmail: !!member.email,
                          }];
                          setSelectedRecipients(newRecipients);
                        }
                      }}
                      disabled={isSelected}
                      className={`w-full text-left p-4 border rounded-lg transition-colors ${
                        isSelected 
                          ? 'bg-green-50 border-green-300 opacity-60' 
                          : 'hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-sm text-gray-500">{member.member_number}</p>
                        </div>
                        <div className="text-right">
                          {member.email ? (
                            <span className="text-sm text-green-600">✓ Email</span>
                          ) : (
                            <span className="text-sm text-red-500">⚠️ No email</span>
                          )}
                          {isSelected && <span className="ml-2 text-green-600 text-sm">✓ Selected</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedRecipients.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">
                      Selected ({selectedRecipients.length})
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedRecipients([]);
                        setValidationResult(null);
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRecipients.map(r => (
                      <span key={r.id} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                        {r.name}
                        {r.hasEmail ? ' ✓' : ' ⚠️'}
                        <button
                          onClick={() => removeRecipient(r.id)}
                          className="ml-1 hover:text-indigo-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setShowBulkMemberPicker(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowBulkMemberPicker(false);
                  }}
                  disabled={selectedRecipients.length === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Done ({selectedRecipients.length} selected)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
