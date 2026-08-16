'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, formatRole, getRoleBadgeColor } from '@/lib/auth';

interface Notification {
  id: string;
  subject?: string;
  body?: string;
  title?: string;
  message?: string;
  status: string;
  created_at: string;
  read_at: string | null;
}

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Member Lookup', href: '/dashboard/lookup', icon: '🔍' },
  { name: 'Members', href: '/dashboard/members', icon: '👥' },
  { name: 'Transactions', href: '/dashboard/transactions', icon: '💰' },
  { name: 'Loans', href: '/dashboard/loans', icon: '🏦' },
  { name: 'Fines', href: '/dashboard/fines', icon: '⚠️' },
  { name: 'Welfare', href: '/dashboard/welfare', icon: '🛡️' },
  { name: 'Contributions', href: '/dashboard/contributions', icon: '🎯' },
  { name: 'Unity Fund', href: '/dashboard/unity-fund', icon: '🏛️' },
  { name: 'Documents', href: '/dashboard/documents', icon: '📄' },
  { name: 'Compliance', href: '/dashboard/compliance', icon: '✅' },
  { name: 'Meetings', href: '/dashboard/meetings', icon: '📅' },
  { name: 'Reports', href: '/dashboard/reports', icon: '📈' },
  { name: 'Notifications', href: '/dashboard/notifications', icon: '🔔' },
  { name: 'Email Queue', href: '/dashboard/email-queue', icon: '📧' },
  { name: 'Automation', href: '/dashboard/automation', icon: '⚙️' },
  { name: 'Media & Assets', href: '/dashboard/media', icon: '🖼️' },
  { name: 'AI Intelligence', href: '/dashboard/ai-intelligence', icon: '🧠' },
  { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: '📋' },
  { name: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isSuperAdmin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  useEffect(() => {
    if (!user?.id) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?recipient_id=${user.id}&recipient_type=user&limit=10`);
        const data = await res.json();
        if (data.success) {
          setNotifications(data.data || []);
          const unread = (data.data || []).filter((n: Notification) => n.status !== 'read').length;
          setUnreadCount(unread);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };

    fetchNotifications();
    // Refresh every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notification_id: notificationId }),
      });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, status: 'read', read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      router.push('/login');
    }
  };

  const formatNotificationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Redirect to login if not authenticated
  if (!isLoading && !user) {
    router.push('/login');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-indigo-900 text-white transition-all duration-300 flex flex-col fixed h-full z-20`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-indigo-800">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <h1 className="text-xl font-bold">YUNITE</h1>
                <p className="text-xs text-indigo-300">Enterprise OS</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-indigo-800 transition-colors"
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    {sidebarOpen && <span>{item.name}</span>}
                  </Link>
                </li>
              );
            })}

            {/* Admin Section */}
            {user?.isSuperAdmin && (
              <>
                <li className="pt-6 pb-2">
                  {sidebarOpen && (
                    <div className="px-4 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                      Administration
                    </div>
                  )}
                </li>
                <li>
                  <Link
                    href="/dashboard/admin/users"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      pathname === '/dashboard/admin/users' || pathname.startsWith('/dashboard/admin/users')
                        ? 'bg-red-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">👤</span>
                    {sidebarOpen && <span>User Management</span>}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/api-docs"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      pathname === '/dashboard/api-docs'
                        ? 'bg-red-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">📖</span>
                    {sidebarOpen && <span>API Documentation</span>}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/system-status"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      pathname === '/dashboard/system-status'
                        ? 'bg-red-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">💚</span>
                    {sidebarOpen && <span>System Status</span>}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard/admin/login-activity"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      pathname === '/dashboard/admin/login-activity'
                        ? 'bg-red-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl">🔐</span>
                    {sidebarOpen && <span>Login Activity</span>}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-indigo-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-indigo-700 rounded-full flex items-center justify-center text-lg font-bold">
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-indigo-900 rounded-full"></div>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-indigo-300 truncate">{formatRole(user?.role || '')}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {new Date().toLocaleDateString('en-KE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications Bell */}
              <div className="relative" ref={notificationRef}>
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-[500px] overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600">
                      <h3 className="font-semibold text-white">Notifications</h3>
                      <Link 
                        href="/dashboard/notifications"
                        onClick={() => setShowNotifications(false)}
                        className="text-xs text-white/80 hover:text-white"
                      >
                        View all →
                      </Link>
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <p className="text-sm">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <Link
                            key={notification.id}
                            href={`/dashboard/notifications/${notification.id}`}
                            onClick={() => {
                              setShowNotifications(false);
                              if (notification.status !== 'read') {
                                markAsRead(notification.id);
                              }
                            }}
                            className={`block p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                              notification.status !== 'read' ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${notification.status !== 'read' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${notification.status !== 'read' ? 'text-gray-900' : 'text-gray-600'}`}>
                                  {notification.subject || notification.title || '(no subject)'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {notification.body || notification.message || ''}
                                </p>
                                <p className="text-xs text-gray-400 mt-2">{formatNotificationTime(notification.created_at)}</p>
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium">
                    {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                    <p className="text-xs text-gray-500">{formatRole(user?.role || '')}</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                        <span className={`inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(user?.role || '')}`}>
                          {formatRole(user?.role || '')}
                        </span>
                      </div>

                      {/* Menu Items */}
                      <div className="py-2">
                        <Link
                          href="/profile"
                          className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          My Profile
                        </Link>

                        {user?.isSuperAdmin && (
                          <Link
                            href="/dashboard/admin/users"
                            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            User Management
                          </Link>
                        )}
                      </div>

                      {/* Logout */}
                      <div className="border-t border-gray-100 pt-2">
                        <button
                          onClick={handleLogout}
                          disabled={loggingOut}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          {loggingOut ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Signing out...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                              </svg>
                              Sign Out
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
