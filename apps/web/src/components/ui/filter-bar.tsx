"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  actions,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-3",
        "border-b border-[--border]",
        className
      )}
    >
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[--text-dim]">
        <SlidersHorizontal size={12} />
        <span>Filters</span>
      </div>

      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onSearchChange !== undefined && (
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[--text-dim]"
            />
            <input
              type="text"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(
                "h-7 rounded border border-[--border-strong] bg-[--bg-elevated]",
                "pl-7 pr-3 text-[12px] text-[--text-primary] placeholder:text-[--text-dim]",
                "focus:outline-none focus:border-[--accent]",
                "transition-[border-color] duration-[150ms]",
                "w-48"
              )}
            />
          </div>
        )}
        {actions && (
          <div className="flex items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: FilterSelectProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="text-[11px] text-[--text-muted] uppercase tracking-[0.04em] font-medium">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-7 rounded border border-[--border-strong] bg-[--bg-elevated]",
          "px-2 text-[12px] text-[--text-primary]",
          "focus:outline-none focus:border-[--accent]",
          "transition-[border-color] duration-[150ms]",
          "cursor-pointer"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
