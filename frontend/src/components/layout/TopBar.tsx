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
    <header className="sticky top-0 z-30 h-16 border-b border-neutral-200/60 bg-white/90 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/90">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:flex"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Organization Switcher */}
          <div className="relative hidden md:block" ref={orgRef}>
            <button
              onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {currentOrganization?.name || "Select Organization"}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 text-neutral-400 transition-transform duration-200",
                showOrgSwitcher && "rotate-180"
              )} />
            </button>
            <AnimatePresence>
              {showOrgSwitcher && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Organizations</p>
                  </div>
                  <div className="p-1.5">
                    {["YUNITE SACCO", "Chama A", "Cooperative B"].map((org) => (
                      <button
                        key={org}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/50"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          <Building2 className="h-4 w-4 text-neutral-500" />
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
            <div className="hidden items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500 dark:bg-neutral-800/50 lg:flex">
              <GitBranch className="h-3.5 w-3.5" />
              {currentBranch.name}
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1">
          {/* Global Search */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="group hidden items-center gap-2 rounded-lg border border-neutral-200 bg-white/70 px-3 py-1.5 text-sm text-neutral-400 transition-all hover:bg-neutral-50 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/70 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300 md:flex"
          >
            <Search className="h-4 w-4" />
            <span>Search...</span>
            <kbd className="hidden items-center gap-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 group-hover:bg-neutral-200 dark:bg-neutral-800 dark:group-hover:bg-neutral-700 lg:flex">
              <Command className="h-3 w-3" />K
            </kbd>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Toggle theme"
          >
            <motion.div
              initial={false}
              animate={{ rotate: theme === "dark" ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.div>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <NotificationBadge count={unreadCount} className="absolute -right-0.5 -top-0.5" />
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Notifications</h3>
                    <button className="text-xs font-medium text-primary-600 hover:text-primary-700">Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n, i) => (
                      <motion.button
                        key={n.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-800 last:border-0 dark:hover:bg-neutral-800/50"
                      >
                        <div className={cn(
                          "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                          n.type === "warning" && "bg-amber-500",
                          n.type === "success" && "bg-primary-500",
                          n.type === "info" && "bg-blue-500",
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-0">{n.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{n.message}</p>
                          <p className="mt-1 text-[10px] font-medium text-neutral-400">{n.time}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
                    <button className="w-full py-2 text-center text-sm font-medium text-primary-600 hover:text-primary-700">
                      View All Notifications
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="mx-1 hidden h-6 w-px bg-neutral-200 dark:bg-neutral-700 sm:block" />

          {/* Quick Action Button */}
          <button className="flex items-center gap-2 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_8px_20px_-10px_rgba(5,150,105,0.5)] transition-all hover:bg-primary-700 active:translate-y-px">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Action</span>
          </button>

          {/* Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
              aria-label="Profile menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-sm font-semibold text-white">
                {user ? getInitials(`${user.firstName} ${user.lastName}`) : "AD"}
              </div>
              <div className="hidden text-left lg:block">
                <p className="text-sm font-medium leading-tight text-neutral-700 dark:text-neutral-200">
                  {user ? `${user.firstName} ${user.lastName}` : "Admin User"}
                </p>
                <p className="text-[11px] leading-tight text-neutral-400">Super Administrator</p>
              </div>
              <ChevronDown className={cn(
                "hidden h-4 w-4 text-neutral-400 transition-transform duration-200 lg:block",
                showProfileMenu && "rotate-180"
              )} />
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Admin User</p>
                    <p className="mt-0.5 text-xs text-neutral-500">admin@yunite.org</p>
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
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/50"
                      >
                        <item.icon className="h-4 w-4 text-neutral-400" />
                        {item.label}
                      </button>
                    ))}
                    <div className="mt-1.5 border-t border-neutral-200 pt-1.5 dark:border-neutral-800">
                      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20">
                        <LogOut className="h-4 w-4" />
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