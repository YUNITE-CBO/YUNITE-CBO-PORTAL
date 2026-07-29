import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "KES"): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, format: "short" | "long" | "relative" = "short"): string {
  const d = new Date(date);
  if (format === "relative") {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-KE");
  }
  return d.toLocaleDateString("en-KE", {
    year: "numeric",
    month: format === "long" ? "long" : "short",
    day: "numeric",
  });
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
    pending: "bg-amber-500/10 text-amber-600 border-amber-200",
    approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    rejected: "bg-red-500/10 text-red-600 border-red-200",
    overdue: "bg-red-500/10 text-red-600 border-red-200",
    paid: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    defaulted: "bg-red-500/10 text-red-600 border-red-200",
    completed: "bg-blue-500/10 text-blue-600 border-blue-200",
    in_progress: "bg-amber-500/10 text-amber-600 border-amber-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    submitted: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
    reviewed: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  };
  return colors[status.toLowerCase()] || "bg-gray-100 text-gray-600 border-gray-200";
}