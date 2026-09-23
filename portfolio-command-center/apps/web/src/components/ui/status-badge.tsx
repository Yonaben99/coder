import type { IntegrationHealthStatus, LiveDataStatus } from "@pcc/shared";

export type BadgeTone = "positive" | "negative" | "warning" | "neutral" | "accent";

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: "bg-[var(--color-positive-muted)] text-[var(--color-positive)]",
  negative: "bg-[var(--color-negative-muted)] text-[var(--color-negative)]",
  warning: "bg-[var(--color-warning-muted)] text-[var(--color-warning)]",
  neutral: "bg-[var(--surface-overlay)] text-[var(--text-tertiary)]",
  accent: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
};

const TONE_DOT: Record<BadgeTone, string> = {
  positive: "bg-[var(--color-positive)]",
  negative: "bg-[var(--color-negative)]",
  warning: "bg-[var(--color-warning)]",
  neutral: "bg-[var(--text-tertiary)]",
  accent: "bg-[var(--color-accent)]",
};

export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

const INTEGRATION_STATUS_TONE: Record<IntegrationHealthStatus, BadgeTone> = {
  operational: "positive",
  degraded: "warning",
  failed: "negative",
  not_configured: "neutral",
};

const INTEGRATION_STATUS_LABEL: Record<IntegrationHealthStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  failed: "Failed",
  not_configured: "Not configured",
};

export function IntegrationStatusBadge({ status }: { status: IntegrationHealthStatus }) {
  return <StatusBadge tone={INTEGRATION_STATUS_TONE[status]} label={INTEGRATION_STATUS_LABEL[status]} />;
}

const LIVE_DATA_STATUS_TONE: Record<LiveDataStatus, BadgeTone> = {
  live: "positive",
  delayed: "warning",
  cached: "warning",
  unavailable: "neutral",
};

const LIVE_DATA_STATUS_LABEL: Record<LiveDataStatus, string> = {
  live: "LIVE",
  delayed: "DELAYED",
  cached: "CACHED",
  unavailable: "LIVE DATA UNAVAILABLE",
};

export function LiveDataStatusBadge({ status }: { status: LiveDataStatus }) {
  return <StatusBadge tone={LIVE_DATA_STATUS_TONE[status]} label={LIVE_DATA_STATUS_LABEL[status]} />;
}
