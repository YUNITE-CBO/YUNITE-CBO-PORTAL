"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, Search, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { sidebarSections } from "@/lib/sidebar-data";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, sidebarOpen, setSidebarOpen } = useAppStore();
  const [expandedSections, setExpandedSections] = useState<string[]>(["Overview"]);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const filteredSections = sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          section.title.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((section) => section.items.length > 0);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: sidebarOpen || !sidebarCollapsed ? 0 : -100 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={cn(
          "fixed top-0 left-0 z-50 flex flex-col h-full",
          "bg-white/95 dark:bg-slate-900/95",
          "border-r border-slate-100 dark:border-slate-800",
          "shadow-xl lg:shadow-none",
          sidebarCollapsed ? "w-[72px]" : "w-[260px]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo Header */}
        <div className="flex items-center h-[68px] px-4 border-b border-slate-100 dark:border-slate-800/50">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0 group">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/30 transition-shadow">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 bg-clip-text text-transparent whitespace-nowrap"
            >
              YUNITE
            </motion.span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="ml-auto p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors hidden lg:flex"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Search */}
        {!sidebarCollapsed && (
          <div className="px-3 py-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-thin">
          <nav className="space-y-1">
            {filteredSections.map((section, sectionIndex) => (
              <div key={section.title} className="pt-3 first:pt-0">
                {/* Section Header */}
                {!sidebarCollapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                      {section.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-200",
                        expandedSections.includes(section.title) && "rotate-180"
                      )}
                    />
                  </button>
                )}

                {/* Section Items */}
                <AnimatePresence initial={false}>
                  {(expandedSections.includes(section.title) || sidebarCollapsed) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5 pt-1">
                        {section.items.map((item, itemIndex) => (
                          <motion.div
                            key={item.href}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: itemIndex * 0.03, duration: 0.15 }}
                          >
                            <Link
                              href={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative",
                                isActive(item.href)
                                  ? "bg-gradient-to-r from-emerald-50 to-emerald-50/50 dark:from-emerald-900/30 dark:to-transparent text-emerald-700 dark:text-emerald-400"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                              )}
                            >
                              {/* Active indicator */}
                              {isActive(item.href) && (
                                <motion.div
                                  layoutId="activeIndicator"
                                  className="absolute left-0 w-1 h-5 rounded-r-full bg-emerald-500"
                                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                                />
                              )}
                              
                              {/* Icon */}
                              <item.icon className={cn(
                                "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                                isActive(item.href) 
                                  ? "text-emerald-600 dark:text-emerald-400" 
                                  : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                              )} />
                              
                              {/* Label */}
                              {!sidebarCollapsed && (
                                <span className="truncate flex-1">{item.label}</span>
                              )}
                              
                              {/* Badge */}
                              {item.badge && !sidebarCollapsed && (
                                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer - Collapse button */}
        <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800/50">
          {sidebarCollapsed ? (
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}