'use client';

import { useEffect, useState } from 'react';

interface Schedule {
  id: string;
  schedule_code: string;
  name: string;
  description: string;
  schedule_type: string;
  scheduled_time: string;
  timezone: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  run_count: number;
  template?: { id: string; template_code: string; name: string };
  recipient_type: string;
}

interface Template {
  id: string;
  template_code: string;
  name: string;
}

export default function SchedulesPage() {
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    description: '',
    schedule_type: 'daily',
    scheduled_time: '09:00',
    template_id: '',
    recipient_type: 'all_members',
    is_active: true,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schedulesRes, templatesRes] = await Promise.all([
        fetch('/api/notifications/schedules'),
        fetch('/api/notifications/templates'),
      ]);

      const schedulesData = await schedulesRes.json();
      const templatesData = await templatesRes.json();

      if (schedulesData.success) {
        setSchedules(schedulesData.data || []);
      }
      if (templatesData.success) {
        setTemplates(templatesData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
    setLoading(false);
  };

  const handleCreateSchedule = async () => {
    if (!newSchedule.name || !newSchedule.template_id) {
      alert('Please fill in required fields');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/notifications/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_code: `SCH-${Date.now()}`,
          ...newSchedule,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setShowCreateModal(false);
        setNewSchedule({
          name: '',
          description: '',
          schedule_type: 'daily',
          scheduled_time: '09:00',
          template_id: '',
          recipient_type: 'all_members',
          is_active: true,
        });
        fetchData();
      } else {
        alert(data.error || 'Failed to create schedule');
      }
    } catch (error) {
      alert('Failed to create schedule');
    }
    setCreating(false);
  };

  const handleToggleActive = async (schedule: Schedule) => {
    try {
      const action = schedule.is_active ? 'deactivate' : 'activate';
      await fetch(`/api/notifications/schedules?action=${action}&id=${schedule.id}`, { method: 'POST' });
      fetchData();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    try {
      await fetch(`/api/notifications/schedules?id=${scheduleId}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const formatNextRun = (dateStr: string | null) => {
    if (!dateStr) return 'Not scheduled';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (diff < 0) return 'Overdue';
    if (hours < 24) return `In ${hours}h`;
    if (days < 7) return `In ${days}d`;
    return date.toLocaleDateString();
  };

  const getScheduleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      once: 'One-time',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      annual: 'Annual',
      custom: 'Custom',
    };
    return labels[type] || type;
  };

  const getRecipientTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      all_members: 'All Members',
      active_members: 'Active Members',
      specific_members: 'Specific Members',
      admins: 'Administrators',
      specific_users: 'Specific Users',
      loans_overdue: 'Members with Overdue Loans',
      welfare_pending: 'Members with Pending Welfare',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">⏰ Notification Schedules</h1>
          <p className="text-gray-600 mt-1">Automate notifications with recurring schedules</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Create Schedule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-gray-500 text-sm">Total Schedules</p>
          <p className="text-3xl font-bold text-gray-900">{schedules.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-gray-500 text-sm">Active</p>
          <p className="text-3xl font-bold text-green-600">{schedules.filter(s => s.is_active).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-gray-500 text-sm">Inactive</p>
          <p className="text-3xl font-bold text-gray-600">{schedules.filter(s => !s.is_active).length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-gray-500 text-sm">Total Runs</p>
          <p className="text-3xl font-bold text-blue-600">
            {schedules.reduce((sum, s) => sum + (s.run_count || 0), 0)}
          </p>
        </div>
      </div>

      {/* Schedules List */}
      <div className="bg-white rounded-xl shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">All Schedules</h2>
        </div>

        <div className="divide-y">
          {schedules.length > 0 ? schedules.map((schedule) => (
            <div key={schedule.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">{schedule.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${schedule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {schedule.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                      {getScheduleTypeLabel(schedule.schedule_type)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{schedule.description || 'No description'}</p>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <span>📋</span> Template: {schedule.template?.name || 'Not set'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>👥</span> {getRecipientTypeLabel(schedule.recipient_type)}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>🕐</span> {schedule.scheduled_time || 'Not set'}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>▶️</span> Next: {formatNextRun(schedule.next_run_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>📊</span> Runs: {schedule.run_count || 0}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleToggleActive(schedule)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      schedule.is_active 
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {schedule.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">⏰</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Schedules Yet</h3>
              <p className="text-gray-600 mb-4">
                Create scheduled notifications to automate communication with members
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Create Your First Schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Create Notification Schedule</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Name *
                </label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  placeholder="e.g., Monthly Statement Reminder"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newSchedule.description}
                  onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schedule Type *
                  </label>
                  <select
                    value={newSchedule.schedule_type}
                    onChange={(e) => setNewSchedule({ ...newSchedule, schedule_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="once">One-time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={newSchedule.scheduled_time}
                    onChange={(e) => setNewSchedule({ ...newSchedule, scheduled_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template *
                </label>
                <select
                  value={newSchedule.template_id}
                  onChange={(e) => setNewSchedule({ ...newSchedule, template_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.template_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipients *
                </label>
                <select
                  value={newSchedule.recipient_type}
                  onChange={(e) => setNewSchedule({ ...newSchedule, recipient_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="all_members">All Members</option>
                  <option value="active_members">Active Members Only</option>
                  <option value="admins">Administrators</option>
                  <option value="loans_overdue">Members with Overdue Loans</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={newSchedule.is_active}
                  onChange={(e) => setNewSchedule({ ...newSchedule, is_active: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Enable this schedule immediately
                </label>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSchedule}
                  disabled={creating || !newSchedule.name || !newSchedule.template_id}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
