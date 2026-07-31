"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline" | "primary";
  size?: "xs" | "sm" | "md";
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
    default: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    success: "bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-400",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400",
    error: "bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400",
    info: "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",
    outline: "bg-transparent border border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400",
    primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-400",
  };
  
  const sizes = {
    xs: "px-1.5 py-0.5 text-[10px]",
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs",
  };

  const dotColors = {
    default: "bg-neutral-400",
    success: "bg-primary-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    outline: "bg-neutral-400",
    primary: "bg-primary-500",
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])} />}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: "active" | "pending" | "inactive" | "completed" | "failed" | "draft" | "processing" | "cancelled" | "on_hold";
  size?: "xs" | "sm" | "md";
  showDot?: boolean;
}

export function StatusBadge({ status, size = "md", showDot = true }: StatusBadgeProps) {
  const statusConfig: Record<string, { variant: "success" | "warning" | "error" | "info" | "default" | "outline"; label: string }> = {
    active: { variant: "success", label: "Active" },
    completed: { variant: "success", label: "Completed" },
    processing: { variant: "info", label: "Processing" },
    pending: { variant: "warning", label: "Pending" },
    on_hold: { variant: "warning", label: "On Hold" },
    draft: { variant: "default", label: "Draft" },
    inactive: { variant: "error", label: "Inactive" },
    failed: { variant: "error", label: "Failed" },
    cancelled: { variant: "error", label: "Cancelled" },
  };

  const config = statusConfig[status] || { variant: "default" as const, label: status };

  return (
    <Badge variant={config.variant} size={size} dot={showDot}>
      {config.label}
    </Badge>
  );
}

interface NotificationBadgeProps {
  count: number;
  maxCount?: number;
  className?: string;
}

export function NotificationBadge({ count, maxCount = 99, className }: NotificationBadgeProps) {
  if (count <= 0) return null;
  
  const displayCount = count > maxCount ? `${maxCount}+` : count.toString();
  
  return (
    <span className={cn(
      "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white",
      className
    )}>
      {displayCount}
    </span>
  );
}