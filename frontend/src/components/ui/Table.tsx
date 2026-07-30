"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function Table<T extends { id?: string | number }>({
  columns,
  data,
  className,
  emptyState,
  onRowClick,
}: TableProps<T>) {
  if (data.length === 0 && emptyState) {
    return (
      <div className={cn("bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800", className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500",
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.map((row, index) => (
              <tr
                key={row.id || index}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300",
                      column.className
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Pagination Component
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className={cn("flex items-center justify-between px-4 py-3", className)}>
      <div className="text-sm text-neutral-500">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>

        {getPageNumbers().map((page, index) => (
          typeof page === "number" ? (
            <button
              key={index}
              onClick={() => onPageChange(page)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                currentPage === page
                  ? "bg-primary-600 text-white border-primary-600"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              )}
            >
              {page}
            </button>
          ) : (
            <span key={index} className="px-2 text-neutral-400">...</span>
          )
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Table Header Cell with Sort
interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableHeader({ label, sortKey, sortConfig, onSort, className }: SortableHeaderProps) {
  const isActive = sortConfig.key === sortKey;

  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider transition-colors",
        isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
        className
      )}
    >
      {label}
      <span className="flex flex-col">
        <svg
          className={cn(
            "w-2 h-2",
            isActive && sortConfig.direction === "asc" ? "text-primary-600" : "text-neutral-300"
          )}
          viewBox="0 0 10 5"
        >
          <path d="M0 5L5 0L10 5" fill="currentColor" />
        </svg>
        <svg
          className={cn(
            "w-2 h-2 -mt-0.5",
            isActive && sortConfig.direction === "desc" ? "text-primary-600" : "text-neutral-300"
          )}
          viewBox="0 0 10 5"
        >
          <path d="M0 0L5 5L10 0" fill="currentColor" />
        </svg>
      </span>
    </button>
  );
}
