import type { LiveDataMeta } from "@pcc/shared";

const STATUS_LABEL: Record<LiveDataMeta["status"], string> = {
  live: "LIVE",
  cached: "CACHED",
  delayed: "DELAYED",
  unavailable: "UNAVAILABLE",
};

const STATUS_COLOR: Record<LiveDataMeta["status"], string> = {
  live: "text-[var(--color-positive)]",
  cached: "text-[var(--color-warning)]",
  delayed: "text-[var(--color-warning)]",
  unavailable: "text-[var(--text-tertiary)]",
};

function MetaLine({ meta }: { meta: LiveDataMeta }) {
  if (meta.status === "unavailable") {
    return <p className="mt-1 text-xs text-[var(--text-secondary)]">{meta.reason ?? "Waiting for IBKR connection"}</p>;
  }
  const time = meta.timestamp ? new Date(meta.timestamp).toLocaleTimeString() : null;
  return (
    <p className="font-numeric mt-1 text-xs text-[var(--text-secondary)]">
      <span className={STATUS_COLOR[meta.status]}>{STATUS_LABEL[meta.status]}</span>
      {" · "}
      {meta.source}
      {time && <> {" · "}{time}</>}
    </p>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  meta,
  tone = "neutral",
}: {
  label: string;
  /** Pre-formatted display value, or null to show the "—" placeholder. */
  value: string | null;
  /** Plain caption text. Ignored when `meta` is provided — meta renders a richer source/status/timestamp line. */
  hint?: string;
  meta?: LiveDataMeta;
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
      {meta ? <MetaLine meta={meta} /> : hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}
