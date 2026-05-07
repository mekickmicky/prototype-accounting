"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccountOption {
  code: string;
  name_th: string;
  name_en?: string;
  is_postable: boolean;
  is_active: boolean;
}

interface AccountPickerProps {
  value?: string | null;
  onChange: (code: string | null) => void;
  accounts: AccountOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AccountPicker({
  value,
  onChange,
  accounts,
  disabled = false,
  placeholder = "เลือกบัญชี...",
  className,
}: AccountPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const eligible = accounts.filter((a) => a.is_postable && a.is_active);

  const filtered = query.trim()
    ? eligible.filter((a) => {
        const q = query.toLowerCase();
        return (
          a.code.toLowerCase().includes(q) ||
          a.name_th.toLowerCase().includes(q) ||
          (a.name_en ?? "").toLowerCase().includes(q)
        );
      })
    : eligible;

  const selected = accounts.find((a) => a.code === value) ?? null;

  function handleSelect(code: string) {
    onChange(code === value ? null : code);
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
            "z-50 min-w-(--radix-popover-trigger-width) min-w-64",
            "rounded border border-[--border-strong] bg-[--surface]",
            "shadow-[var(--shadow)] overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          <div className="flex items-center gap-2 border-b border-[--border] px-2.5 py-1.5">
            <Search size={12} className="shrink-0 text-[--text-dim]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหารหัสหรือชื่อบัญชี..."
              className={cn(
                "flex-1 bg-transparent text-[12px] text-[--text-primary]",
                "placeholder:text-[--text-dim] outline-none"
              )}
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-[--text-dim]">
                ไม่พบบัญชี
              </div>
            ) : (
              filtered.map((account) => (
                <button
                  key={account.code}
                  type="button"
                  onClick={() => handleSelect(account.code)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5",
                    "text-left hover:bg-[--bg-hover]",
                    "transition-colors duration-[100ms]",
                    account.code === value && "bg-[--bg-hover]"
                  )}
                >
                  <Check
                    size={12}
                    className={cn(
                      "shrink-0 text-[--accent]",
                      account.code === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="w-14 shrink-0 font-mono text-[11px] text-[--text-muted]">
                    {account.code}
                  </span>
                  <span className="flex-1 truncate text-[12px] text-[--text-primary]">
                    {account.name_th}
                    {account.name_en && (
                      <span className="ml-1 text-[11px] text-[--text-dim]">
                        / {account.name_en}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
