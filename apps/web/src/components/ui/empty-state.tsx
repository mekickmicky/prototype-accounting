import { FileX } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "No results",
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16",
        "text-center text-[--text-muted]",
        className
      )}
    >
      <div className="text-[--text-dim]">
        {icon ?? <FileX size={32} strokeWidth={1.5} />}
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[--text-primary]">{title}</p>
        {description && (
          <p className="text-[12px] text-[--text-muted]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
