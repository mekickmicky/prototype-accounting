"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLINIC_SERVICES,
  type CatalogService,
  type ServiceCategory,
} from "@wind-acc/shared";

export type { CatalogService };

interface ServicePickerProps {
  value?: string | null;
  onChange: (code: string | null, service: CatalogService | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  BOTOX: "Botox",
  FILLER: "Filler",
  LASER: "Laser",
  SKINCARE: "Skincare",
  BODY: "Body",
  PRODUCT: "Product",
  OTHER: "Other",
};

export function ServicePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "เลือกบริการ...",
  className,
}: ServicePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = value
    ? (CLINIC_SERVICES.find((s) => s.code === value) ?? null)
    : null;

  const filtered = query.trim()
    ? CLINIC_SERVICES.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.code.toLowerCase().includes(q) ||
          s.name_th.toLowerCase().includes(q) ||
          s.name_en.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      })
    : CLINIC_SERVICES;

  function handleSelect(s: CatalogService) {
    onChange(s.code === value ? null : s.code, s.code === value ? null : s);
    setOpen(false);
    setQuery("");
  }

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    } else {
      setQuery("");
    }
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2",
            "rounded border border-[--border-strong] bg-[--bg-elevated]",
            "px-2.5 text-[13px] text-[--text-primary]",
            "focus:outline-none focus:border-[--accent]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-[border-color] duration-[150ms]",
            className
          )}
        >
          <span className={cn("truncate", !selected && "text-[--text-dim]")}>
            {selected
              ? `${selected.code} · ${selected.name_th}`
              : placeholder}
          </span>
          <ChevronsUpDown size={12} className="shrink-0 text-[--text-dim]" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className={cn(
            "z-50 min-w-(--radix-popover-trigger-width) min-w-80",
            "rounded border border-[--border-strong] bg-[--surface]",
            "shadow-[var(--shadow)] overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[--border] px-2.5 py-1.5">
            <Search size={12} className="shrink-0 text-[--text-dim]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาบริการ..."
              className={cn(
                "flex-1 bg-transparent text-[12px] text-[--text-primary]",
                "placeholder:text-[--text-dim] outline-none"
              )}
            />
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-[--text-dim]">
                ไม่พบบริการ
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5",
                    "text-left hover:bg-[--bg-hover]",
                    "transition-colors duration-[100ms]",
                    s.code === value && "!bg-[rgba(200,150,122,0.15)]"
                  )}
                >
                  <Check
                    size={12}
                    className={cn(
                      "shrink-0 text-[--accent]",
                      s.code === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="w-24 shrink-0 font-mono text-[10px] text-[--text-muted]">
                    {s.code}
                  </span>
                  <span className="flex-1 truncate text-[12px] text-[--text-primary]">
                    {s.name_th}
                    <span className="ml-1 text-[11px] text-[--text-dim]">
                      / {s.name_en}
                    </span>
                  </span>
                  <CategoryTag category={s.category} />
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function CategoryTag({ category }: { category: ServiceCategory }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-wide",
        CATEGORY_COLORS[category]
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

const CATEGORY_COLORS: Record<ServiceCategory, string> = {
  BOTOX: "bg-purple-500/15 text-purple-400",
  FILLER: "bg-pink-500/15 text-pink-400",
  LASER: "bg-orange-500/15 text-orange-400",
  SKINCARE: "bg-teal-500/15 text-teal-400",
  BODY: "bg-blue-500/15 text-blue-400",
  PRODUCT: "bg-yellow-500/15 text-yellow-500",
  OTHER: "bg-[--bg-hover] text-[--text-muted]",
};
