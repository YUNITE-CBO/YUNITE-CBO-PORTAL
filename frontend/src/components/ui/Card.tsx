"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

export function Card({ 
  children, 
  className, 
  hover = true, 
  padding = "md",
  onClick 
}: CardProps) {
  const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-5",
    lg: "p-6",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm",
        hover && "hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-200",
        paddingClasses[padding],
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn("text-base font-semibold text-neutral-900 dark:text-neutral-0", className)}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-neutral-500 dark:text-neutral-400", className)}>
      {children}
    </p>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("", className)}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("flex items-center pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800", className)}>
      {children}
    </div>
  );
}

// Stat Card Component for Dashboard
interface StatCardProps {
  title: string;
  value: string | number;
  change?: { value: string; positive: boolean };
  icon?: ReactNode;
  iconColor?: string;
  subtitle?: string;
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  change, 
  icon, 
  iconColor = "bg-primary-500",
  subtitle,
  className 
}: StatCardProps) {
  return (
    <div className={cn(
      "bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5",
      "transition-all duration-200 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-0 tracking-tight">{value}</p>
          {change && (
            <div className="flex items-center gap-1.5">
              {change.positive ? (
                <span className="inline-flex items-center text-xs font-semibold text-primary-600">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  {change.value}
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-semibold text-red-600 dark:text-red-400">
                  <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  {change.value}
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-neutral-400">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shadow-sm", iconColor)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
