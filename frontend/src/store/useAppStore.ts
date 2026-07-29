import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Organization, Branch, Notification, SidebarItem } from '@/types';

interface AppState {
  // User & Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  
  // Organization & Branch
  currentOrganization: Organization | null;
  currentBranch: Branch | null;
  organizations: Organization[];
  branches: Branch[];
  setCurrentOrganization: (org: Organization | null) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setBranches: (branches: Branch[]) => void;

  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarOpen: (open: boolean) => void;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;

  // Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Quick Actions
  quickActions: { label: string; icon: string; href: string; shortcut?: string }[];
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // User & Auth
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),

      // Organization & Branch
      currentOrganization: null,
      currentBranch: null,
      organizations: [],
      branches: [],
      setCurrentOrganization: (org) => set({ currentOrganization: org }),
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      setOrganizations: (orgs) => set({ organizations: orgs }),
      setBranches: (branches) => set({ branches }),

      // Theme
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(newTheme);
      },

      // Sidebar
      sidebarCollapsed: false,
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Notifications
      notifications: [],
      unreadCount: 0,
      setNotifications: (notifications) =>
        set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),
      addNotification: (notification) =>
        set((state) => ({
          notifications: [notification, ...state.notifications],
          unreadCount: state.unreadCount + (notification.read ? 0 : 1),
        })),
      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unreadCount: state.unreadCount - 1,
        })),
      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),

      // Command Palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // Quick Actions
      quickActions: [
        { label: 'New Member', icon: 'UserPlus', href: '/members/new', shortcut: 'M' },
        { label: 'New Loan', icon: 'HandCoins', href: '/loans/new', shortcut: 'L' },
        { label: 'New Savings', icon: 'PiggyBank', href: '/savings/new', shortcut: 'S' },
        { label: 'New Transaction', icon: 'ArrowRightLeft', href: '/transactions/new', shortcut: 'T' },
        { label: 'New Meeting', icon: 'Users', href: '/meetings/new', shortcut: 'E' },
        { label: 'New Report', icon: 'FileBarChart', href: '/reports/new', shortcut: 'R' },
      ],
    }),
    {
      name: 'yunite-admin-store',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        currentOrganization: state.currentOrganization,
        currentBranch: state.currentBranch,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);