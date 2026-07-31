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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full flex-col",
          "border-r border-neutral-200/60 bg-white/95 shadow-[8px_0_30px_-20px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/95",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center border-b border-neutral-200/60 px-4 dark:border-neutral-800">
          <Link href="/dashboard" className="group flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <motion.span
              initial={false}
              animate={{ opacity: sidebarCollapsed ? 0 : 1, width: sidebarCollapsed ? 0 : "auto" }}
              transition={{ duration: 0.15 }}
              className="whitespace-nowrap text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-0"
            >
              YUNITE
            </motion.span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="ml-auto hidden rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 lg:flex"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Search bar */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3">
            <div className="group relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 transition-colors group-focus-within:text-primary-500" />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50/80 pl-9 pr-3 text-xs text-neutral-900 transition-all placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 scrollbar-thin">
          <nav className="space-y-0.5">
            {filteredSections.map((section) => (
              <div key={section.title} className="pt-1 first:pt-0">
                {/* Section Header */}
                {!sidebarCollapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors",
                      expandedSections.includes(section.title)
                        ? "text-neutral-500 dark:text-neutral-400"
                        : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-500 dark:hover:text-neutral-400"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn(
                        "h-1 w-1 rounded-full transition-colors",
                        expandedSections.includes(section.title)
                          ? "bg-primary-500"
                          : "bg-neutral-300 dark:bg-neutral-600"
                      )} />
                      {section.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform duration-200",
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
                      <div className="space-y-0.5 pt-0.5">
                        {section.items.map((item) => {
                          const active = isActive(item.href);
                          return (
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
                                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                                  active
                                    ? "bg-primary-50 text-primary-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)] dark:bg-primary-900/15 dark:text-primary-400"
                                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-white"
                                )}
                              >
                                {active && (
                                  <motion.div
                                    layoutId="activeIndicator"
                                    className="absolute left-0 h-5 w-0.5 rounded-r-full bg-primary-500"
                                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                                  />
                                )}
                                
                                <item.icon className={cn(
                                  "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200",
                                  active 
                                    ? "text-primary-600 dark:text-primary-400" 
                                    : "text-neutral-400 group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300"
                                )} />
                                
                                {!sidebarCollapsed && (
                                  <span className="flex-1 truncate">{item.label}</span>
                                )}
                                
                                {item.badge && !sidebarCollapsed && (
                                  <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                    {item.badge}
                                  </span>
                                )}
                              </Link>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </nav>
        </div>

        {/* Collapse button */}
        <div className="border-t border-neutral-200/60 px-2 py-3 dark:border-neutral-800">
          {sidebarCollapsed ? (
            <button
              onClick={toggleSidebar}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={toggleSidebar}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}