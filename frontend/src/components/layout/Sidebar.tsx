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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className={cn(
          "fixed top-0 left-0 z-50 flex flex-col h-full",
          "bg-white dark:bg-neutral-900",
          "border-r border-neutral-200 dark:border-neutral-800",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo Header */}
        <div className="flex items-center h-16 px-4 border-b border-neutral-200 dark:border-neutral-800">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0 group">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <motion.span
              initial={false}
              animate={{ opacity: sidebarCollapsed ? 0 : 1 }}
              transition={{ duration: 0.15 }}
              className="text-lg font-bold text-neutral-900 dark:text-neutral-0 whitespace-nowrap"
            >
              YUNITE
            </motion.span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="ml-auto p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors hidden lg:flex"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
          <div className="px-3 py-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-primary-500 transition-colors" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 scrollbar-thin">
          <nav className="space-y-0.5">
            {filteredSections.map((section) => (
              <div key={section.title} className="pt-2 first:pt-0">
                {/* Section Header */}
                {!sidebarCollapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                      {section.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-150",
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
                      transition={{ duration: 0.15, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5 pt-1">
                        {section.items.map((item) => (
                          <motion.div
                            key={item.href}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.1 }}
                          >
                            <Link
                              href={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-100 group relative",
                                isActive(item.href)
                                  ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white"
                              )}
                            >
                              {/* Active indicator */}
                              {isActive(item.href) && (
                                <motion.div
                                  layoutId="activeIndicator"
                                  className="absolute left-0 w-0.5 h-5 rounded-r-full bg-primary-500"
                                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                                />
                              )}
                              
                              {/* Icon */}
                              <item.icon className={cn(
                                "w-[17px] h-[17px] flex-shrink-0 transition-colors",
                                isActive(item.href) 
                                  ? "text-primary-600 dark:text-primary-400" 
                                  : "text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-400"
                              )} />
                              
                              {/* Label */}
                              {!sidebarCollapsed && (
                                <span className="truncate flex-1">{item.label}</span>
                              )}
                              
                              {/* Badge */}
                              {item.badge && !sidebarCollapsed && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
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
        <div className="px-2 py-3 border-t border-neutral-200 dark:border-neutral-800">
          {sidebarCollapsed ? (
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleSidebar}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors"
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