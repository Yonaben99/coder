import { AuthGate } from "@/components/layout/auth-gate";
import { EmptyState } from "@/components/ui/empty-state";

export function PlaceholderPage({
  title,
  icon,
  phaseNote,
}: {
  title: string;
  icon: string;
  phaseNote: string;
}) {
  return (
    <AuthGate>
      <div className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
          <span aria-hidden>{icon}</span> {title}
        </h1>
        <EmptyState title="Live data integration pending" description={phaseNote} />
      </div>
    </AuthGate>
  );
}
