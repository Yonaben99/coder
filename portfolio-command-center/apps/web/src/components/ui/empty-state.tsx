import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
      {icon && <span className="text-2xl" aria-hidden>{icon}</span>}
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>}
      {action}
    </div>
  );
}
