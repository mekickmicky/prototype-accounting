import { cn } from "@/lib/utils";

export type DocumentStatus =
  | "DRAFT"
  | "POSTED"
  | "VOID"
  | "PAID"
  | "PARTIAL_PAID"
  | "CLOSED"
  | "LOCKED"
  | "OVERDUE"
  | "OPEN";

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className:
      "text-[--status-draft] border-[--status-draft] bg-[rgba(139,125,111,0.1)]",
  },
  POSTED: {
    label: "Posted",
    className:
      "text-[--status-posted] border-[--status-posted] bg-[rgba(107,142,127,0.1)]",
  },
  VOID: {
    label: "Void",
    className:
      "text-[--status-void] border-[--status-void] bg-[rgba(107,96,104,0.1)]",
  },
  PAID: {
    label: "Paid",
    className:
      "text-[--status-paid] border-[--status-paid] bg-[rgba(74,122,140,0.1)]",
  },
  PARTIAL_PAID: {
    label: "Partial",
    className:
      "text-[--warning] border-[--warning] bg-[rgba(200,163,82,0.1)]",
  },
  CLOSED: {
    label: "Closed",
    className:
      "text-slate-400 border-slate-400 bg-slate-400/10",
  },
  LOCKED: {
    label: "Locked",
    className:
      "text-slate-400 border-slate-400 bg-slate-400/10",
  },
  OVERDUE: {
    label: "Overdue",
    className:
      "text-[--status-overdue] border-[--status-overdue] bg-[rgba(184,92,80,0.1)]",
  },
  OPEN: {
    label: "Open",
    className:
      "text-[--status-posted] border-[--status-posted] bg-[rgba(107,142,127,0.1)]",
  },
};

interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5",
        "text-[10px] font-semibold uppercase tracking-[0.05em]",
        "rounded-[3px] border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
