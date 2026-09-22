export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  /** Pre-formatted display value, or null to show the "—" placeholder. */
  value: string | null;
  hint?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    value === null
      ? "text-[var(--text-tertiary)]"
      : tone === "positive"
        ? "text-[var(--color-positive)]"
        : tone === "negative"
          ? "text-[var(--color-negative)]"
          : "text-[var(--text-primary)]";

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-numeric mt-1 text-2xl font-semibold ${valueColor}`}>{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}
