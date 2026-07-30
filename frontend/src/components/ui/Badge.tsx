"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline";
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

export function Badge({ 
  children, 
  variant = "default", 
  size = "md",
  className,
  dot = false
}: BadgeProps) {
  const baseStyles = "inline-flex items-center gap-1.5 font-medium rounded-full transition-colors";
  
  const variants = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    error: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    outline: "bg-transparent border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400",
  };
  
  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs",
  };

  const dotColors = {
    default: "bg-slate-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    outline: "bg-slate-400",
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[variant])} />}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: "active" | "pending" | "inactive" | "completed" | "failed" | "draft";
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusBadge({ status, size = "md", showDot = true }: StatusBadgeProps) {
  const statusConfig = {
    active: { variant: "success" as const, label: "Active" },
    completed: { variant: "success" as const, label: "Completed" },
    pending: { variant: "warning" as const, label: "Pending" },
    draft: { variant: "outline" as const, label: "Draft" },
    inactive: { variant: "error" as const, label: "Inactive" },
    failed: { variant: "error" as const, label: "Failed" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} size={size} dot={showDot}>
      {config.label}
    </Badge>
  );
}
