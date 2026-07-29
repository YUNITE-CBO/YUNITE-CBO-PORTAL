"use client";

import { useState } from "react";
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
  Keyboard,
  Building2,
  GitBranch,
  Plus,
  List,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { getInitials } from "@/lib/utils";

export function TopBar() {
  const router = useRouter();
  const {
    sidebarCollapsed,
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

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  const notifications = [
    { id: "1", title: "Loan Approval Required", message: "John Doe's loan of KES 50,000 needs approval", type: "warning", time: "5m ago" },
    { id: "2", title: "Payment Received", message: "KES 12,000 received from Jane Smith", type: "success", time: "15m ago" },
    { id: "3", title: "Meeting Reminder", message: "Board meeting starts in 1 hour", type: "info", time: "30m ago" },
    { id: "4", title: "System Alert", message: "Database backup completed successfully", type: "info", time: "1h ago" },
  ];

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Organization Switcher */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {currentOrganization?.name || "Select Organization"}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <AnimatePresence>
              {showOrgSwitcher && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase">Organizations</div>
                    {["YUNITE SACCO", "Chama A", "Cooperative B"].map((org) => (
                      <button
                        key={org}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      >
                        <Building2 className="w-4 h-4 text-slate-400" />
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
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-500">
              <GitBranch className="w-3 h-3" />
              {currentBranch.name}
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Global Search */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 text-sm"
          >
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="hidden lg:inline-flex px-1.5 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-400">⌘K</kbd>
          </button>

          {/* Quick Actions */}
          <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Quick Action</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full right-0 mt-1 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
                      <button className="text-xs text-emerald-600 hover:text-emerald-700">Mark all read</button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        className="w-full flex items-start gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left"
                      >
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                          n.type === "warning" && "bg-amber-500",
                          n.type === "success" && "bg-emerald-500",
                          n.type === "info" && "bg-blue-500",
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{n.message}</p>
                          <p className="text-xs text-slate-400 mt-1">{n.time}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-slate-200 dark:border-slate-700">
                    <button className="w-full py-2 text-sm text-center text-emerald-600 hover:text-emerald-700 font-medium">
                      View All Notifications
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-sm font-medium">
                {user ? getInitials(`${user.firstName} ${user.lastName}`) : "AD"}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight">
                  {user ? `${user.firstName} ${user.lastName}` : "Admin User"}
                </p>
                <p className="text-xs text-slate-400 leading-tight">Super Administrator</p>
              </div>
              <ChevronDown className="hidden lg:block w-3 h-3 text-slate-400" />
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="p-2">
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 mb-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Admin User</p>
                      <p className="text-xs text-slate-500">admin@yunite.org</p>
                    </div>
                    {[
                      { label: "My Profile", icon: User, href: "/profile" },
                      { label: "Settings", icon: Settings, href: "/settings" },
                      { label: "Help Center", icon: HelpCircle, href: "/help" },
                      { label: "Keyboard Shortcuts", icon: Keyboard, href: "#" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => { router.push(item.href); setShowProfileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      >
                        <item.icon className="w-4 h-4 text-slate-400" />
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                      <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600">
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