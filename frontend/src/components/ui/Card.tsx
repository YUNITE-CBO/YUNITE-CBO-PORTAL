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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-xl border border-neutral-200/80 bg-white/90 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/90",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700",
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
    <div className={cn("mb-4 flex items-center justify-between", className)}>
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
    <h3 className={cn("text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-0", className)}>
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
    <div className={cn("mt-4 flex items-center border-t border-neutral-200/60 pt-4 dark:border-neutral-800", className)}>
      {children}
    </div>
  );
}

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
      "rounded-xl border border-neutral-200/80 bg-white/90 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{title}</p>
          <p className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-0">{value}</p>
          {change && (
            <div className="flex items-center gap-1.5">
              {change.positive ? (
                <span className="inline-flex items-center text-xs font-semibold text-primary-600">
                  <svg className="mr-0.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  {change.value}
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-semibold text-red-600 dark:text-red-400">
                  <svg className="mr-0.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shadow-sm", iconColor)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}