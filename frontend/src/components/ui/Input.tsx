"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    label,
    error,
    hint,
    icon,
    iconPosition = "left",
    type = "text",
    ...props 
  }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === "left" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              "w-full h-10 px-3 text-sm text-slate-900 dark:text-white",
              "bg-white dark:bg-slate-900",
              "border border-slate-200 dark:border-slate-700",
              "rounded-lg",
              "placeholder:text-slate-400 dark:placeholder:text-slate-500",
              "transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500",
              icon && iconPosition === "left" && "pl-10",
              icon && iconPosition === "right" && "pr-10",
              error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
              className
            )}
            {...props}
          />
          {icon && iconPosition === "right" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
