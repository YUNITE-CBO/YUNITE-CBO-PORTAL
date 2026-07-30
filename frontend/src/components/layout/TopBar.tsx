"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  LogOut,
  Settings,
  User,
  HelpCircle,
  Building2,
  GitBranch,
  Plus,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { getInitials } from "@/lib/utils";
import { NotificationBadge } from "@/components/ui/Badge";

export function TopBar() {
  const router = useRouter();
  const {
    toggleSidebar,
    setSidebarOpen,
    theme,
    toggleTheme,
    user,
    currentOrganization,
    currentBranch,
    unreadCount,
    setCommandPaletteOpen,
  } = useAppStore();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);

  const notifications = [
    { id: "1", title: "Loan Approval Required", message: "John Doe's loan of KES 50,000 needs approval", type: "warning", time: "5m ago" },
    { id: "2", title: "Payment Received", message: "KES 12,000 received from Jane Smith", type: "success", time: "15m ago" },
    { id: "3", title: "Meeting Reminder", message: "Board meeting starts in 1 hour", type: "info", time: "30m ago" },
    { id: "4", title: "System Alert", message: "Database backup completed successfully", type: "info", time: "1h ago" },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (orgRef.current && !orgRef.current.contains(event.target as Node)) {
        setShowOrgSwitcher(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Organization Switcher */}
          <div className="relative hidden md:block" ref={orgRef}>
            <button
              onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {currentOrganization?.name || "Select Organization"}
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 text-neutral-400 transition-transform duration-150",
                showOrgSwitcher && "rotate-180"
              )} />
            </button>
            <AnimatePresence>
              {showOrgSwitcher && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                >
                  <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Organizations</p>
                  </div>
                  <div className="p-1.5">
                    {["YUNITE SACCO", "Chama A", "Cooperative B"].map((org) => (
                      <button
                        key={org}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-200 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-neutral-500" />
                        </div>
                        {org}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Branch indicator */}
          {currentBranch && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800/50 text-xs font-medium text-neutral-500">
              <GitBranch className="w-3.5 h-3.5" />
              {currentBranch.name}
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1">
          {/* Global Search */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-sm transition-all group"
          >
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="hidden lg:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-medium text-neutral-400 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700">
              <Command className="w-3 h-3" />K
            </kbd>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            aria-label="Toggle theme"
          >
            <motion.div
              initial={false}
              animate={{ rotate: theme === "dark" ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.div>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <NotificationBadge count={unreadCount} className="absolute -top-0.5 -right-0.5" />
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                >
                  <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Notifications</h3>
                    <button className="text-xs text-primary-600 hover:text-primary-700 font-medium">Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n, i) => (
                      <motion.button
                        key={n.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-left border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors"
                      >
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                          n.type === "warning" && "bg-amber-500",
                          n.type === "success" && "bg-primary-500",
                          n.type === "info" && "bg-blue-500",
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-0">{n.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{n.message}</p>
                          <p className="text-[10px] text-neutral-400 mt-1 font-medium">{n.time}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <div className="p-3 border-t border-neutral-200 dark:border-neutral-800">
                    <button className="w-full py-2 text-sm text-center text-primary-600 hover:text-primary-700 font-medium">
                      View All Notifications
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-neutral-200 dark:bg-neutral-700 mx-1" />

          {/* Quick Action Button */}
          <button className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm hover:shadow transition-all">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Quick Action</span>
          </button>

          {/* Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-sm font-semibold">
                {user ? getInitials(`${user.firstName} ${user.lastName}`) : "AD"}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 leading-tight">
                  {user ? `${user.firstName} ${user.lastName}` : "Admin User"}
                </p>
                <p className="text-[11px] text-neutral-400 leading-tight">Super Administrator</p>
              </div>
              <ChevronDown className={cn(
                "hidden lg:block w-4 h-4 text-neutral-400 transition-transform duration-150",
                showProfileMenu && "rotate-180"
              )} />
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                >
                  <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Admin User</p>
                    <p className="text-xs text-neutral-500 mt-0.5">admin@yunite.org</p>
                  </div>
                  <div className="p-1.5">
                    {[
                      { label: "My Profile", icon: User, href: "/profile" },
                      { label: "Settings", icon: Settings, href: "/settings" },
                      { label: "Help Center", icon: HelpCircle, href: "/help" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => { router.push(item.href); setShowProfileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-200 transition-colors"
                      >
                        <item.icon className="w-4 h-4 text-neutral-400" />
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-neutral-200 dark:border-neutral-800 mt-1.5 pt-1.5">
                      <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors">
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}