"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, Search, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface CustomerOption {
  id: string;
  code: string;
  name: string;
  name_th?: string | null;
  phone?: string | null;
  tax_id?: string | null;
}

interface CustomerPickerProps {
  value?: string | null;
  onChange: (id: string | null, customer: CustomerOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function CustomerPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "เลือกลูกค้า...",
  className,
}: CustomerPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<CustomerOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<CustomerOption | null>(null);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch selected customer when value changes externally
  React.useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const inOptions = options.find((o) => o.id === value);
    if (inOptions) {
      setSelected(inOptions);
      return;
    }
    apiClient
      .get<CustomerOption>(`/api/v1/customers/${value}`)
      .then((c) => setSelected(c))
      .catch(() => setSelected(null));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function fetchCustomers(q: string) {
    setLoading(true);
    const qs = new URLSearchParams({ page: "1", page_size: "20" });
    if (q) qs.set("q", q);
    apiClient
      .get<CustomerOption[]>(`/api/v1/customers?${qs}`)
      .then((data) => {
        setOptions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  React.useEffect(() => {
    if (open) {
      fetchCustomers(query);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    } else {
      setQuery("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(q), 250);
  }

  function handleSelect(c: CustomerOption) {
    if (c.id === value) {
      onChange(null, null);
    } else {
      setSelected(c);
      onChange(c.id, c);
    }
    setOpen(false);
    setQuery("");
  }

  function handleQuickAddSuccess(c: CustomerOption) {
    setSelected(c);
    setOptions((prev) => [c, ...prev.filter((o) => o.id !== c.id)]);
    onChange(c.id, c);
    setQuickAddOpen(false);
    setOpen(false);
  }

  return (
    <>
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
                ? `${selected.code} · ${selected.name_th ?? selected.name}`
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
              "z-50 min-w-(--radix-popover-trigger-width) min-w-72",
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
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="ค้นหารหัส ชื่อ หรือเบอร์โทร..."
                className={cn(
                  "flex-1 bg-transparent text-[12px] text-[--text-primary]",
                  "placeholder:text-[--text-dim] outline-none"
                )}
              />
              {loading && (
                <Loader2 size={11} className="animate-spin text-[--text-dim]" />
              )}
            </div>

            {/* Results */}
            <div className="max-h-56 overflow-y-auto py-1">
              {options.length === 0 && !loading ? (
                <div className="px-3 py-3 text-center text-[11px] text-[--text-dim]">
                  ไม่พบลูกค้า
                </div>
              ) : (
                options.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5",
                      "text-left hover:bg-[--bg-hover]",
                      "transition-colors duration-[100ms]",
                      c.id === value && "!bg-[rgba(200,150,122,0.15)]"
                    )}
                  >
                    <Check
                      size={12}
                      className={cn(
                        "shrink-0 text-[--accent]",
                        c.id === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="w-20 shrink-0 font-mono text-[11px] text-[--text-muted]">
                      {c.code}
                    </span>
                    <span className="flex-1 truncate text-[12px] text-[--text-primary]">
                      {c.name_th ?? c.name}
                      {c.phone && (
                        <span className="ml-1 text-[11px] text-[--text-dim]">
                          {c.phone}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Quick add footer */}
            <div className="border-t border-[--border] px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuickAddOpen(true);
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1 py-1",
                  "text-[12px] text-[--accent] hover:bg-[--bg-hover]",
                  "transition-colors duration-[100ms]"
                )}
              >
                <Plus size={12} />
                เพิ่มลูกค้าใหม่
                {query && (
                  <span className="text-[--text-dim]">"{query}"</span>
                )}
              </button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <QuickAddCustomerModal
        open={quickAddOpen}
        initialName={query}
        onClose={() => setQuickAddOpen(false)}
        onSuccess={handleQuickAddSuccess}
      />
    </>
  );
}

// ── Quick-add modal ────────────────────────────────────────────────────────────

interface QuickAddProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSuccess: (customer: CustomerOption) => void;
}

function QuickAddCustomerModal({
  open,
  initialName = "",
  onClose,
  onSuccess,
}: QuickAddProps) {
  const [name, setName] = React.useState(initialName);
  const [nameTh, setNameTh] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setNameTh("");
      setPhone("");
      setTaxId("");
      setError(null);
    }
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (nameTh.trim()) body.name_th = nameTh.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (taxId.trim()) body.tax_id = taxId.trim();
      const created = await apiClient.post<CustomerOption>("/api/v1/customers", body);
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>เพิ่มลูกค้าใหม่</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[--text-muted]">
              ชื่อ (ภาษาอังกฤษ) *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              required
              autoFocus
              className="h-8 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[--text-muted]">
              ชื่อภาษาไทย
            </label>
            <Input
              value={nameTh}
              onChange={(e) => setNameTh(e.target.value)}
              placeholder="ชื่อลูกค้า"
              className="h-8 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.05em] text-[--text-muted]">
                เบอร์โทร
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0xx-xxx-xxxx"
                className="h-8 text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.05em] text-[--text-muted]">
                เลขประจำตัวผู้เสียภาษี
              </label>
              <Input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="13 หลัก"
                maxLength={13}
                className="h-8 text-[13px]"
              />
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-[--destructive]">{error}</p>
          )}

          <DialogFooter className="-mx-4 -mb-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !name.trim()}
              className="gap-1.5"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
