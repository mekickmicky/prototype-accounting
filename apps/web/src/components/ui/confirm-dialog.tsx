"use client";

import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[--modal-bg]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          "w-[480px] max-w-[95vw] rounded-[6px]",
          "border border-[--border-strong] bg-[--bg-base]",
          "shadow-[--shadow] flex flex-col overflow-hidden"
        )}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-desc" : undefined}
      >
        <div className="flex items-start gap-3 border-b border-[--border] px-6 py-4">
          {destructive && (
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-[--error]" />
          )}
          <h2
            id="confirm-title"
            className="text-[14px] font-semibold text-[--text-primary]"
          >
            {title}
          </h2>
        </div>

        {description && (
          <div className="px-6 py-4">
            <p
              id="confirm-desc"
              className="text-[13px] text-[--text-muted]"
            >
              {description}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[--border] px-6 py-3">
          <Button
            ref={cancelRef}
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
