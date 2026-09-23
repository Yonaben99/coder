import type { ReactNode } from "react";

export function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {icon && <span aria-hidden>{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}
