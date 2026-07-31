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
      <div className={cn("rounded-2xl border border-neutral-200/80 bg-white/85 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.16)] dark:border-neutral-800 dark:bg-neutral-900/85", className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/85 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.16)] backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/85", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-neutral-50/90 backdrop-blur dark:bg-neutral-900/90">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500",
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
                  "transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50",
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
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Previous
        </button>

        {getPageNumbers().map((page, index) => (
          typeof page === "number" ? (
            <button
              key={index}
              onClick={() => onPageChange(page)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                currentPage === page
                  ? "border-primary-600 bg-primary-600 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
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
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}

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
        "flex items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
        isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
        className
      )}
    >
      {label}
      <span className="flex flex-col">
        <svg
          className={cn(
            "h-2 w-2",
            isActive && sortConfig.direction === "asc" ? "text-primary-600" : "text-neutral-300"
          )}
          viewBox="0 0 10 5"
        >
          <path d="M0 5L5 0L10 5" fill="currentColor" />
        </svg>
        <svg
          className={cn(
            "-mt-0.5 h-2 w-2",
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
