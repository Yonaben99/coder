"use client";

import { useState } from "react";
import type { AlertCategory, AlertItem, AlertSeverity } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiClient } from "@/lib/api-client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  price_movement: "Price movement",
  pnl_change: "P&L change",
  high_relevance_news: "High-relevance news",
  earnings_approaching: "Earnings approaching",
  earnings_released: "Earnings released",
  analyst_target_revision: "Analyst target revision",
  analyst_rating_change: "Analyst rating change",
  major_catalyst: "Major catalyst",
  concentration_change: "Concentration change",
  margin_liquidity_threshold: "Margin/liquidity threshold",
  exposure_change: "Exposure change",
  data_connection_failure: "Data connection failure",
  stale_data: "Stale data",
  ibkr_connection_status: "IBKR connection status",
};

const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = { critical: "negative", warning: "warning", info: "accent" };

function AlertCard({ alert, onUpdated }: { alert: AlertItem; onUpdated: (alert: AlertItem) => void }) {
  const [busy, setBusy] = useState(false);

  async function setReadState(readState: "read" | "acknowledged") {
    setBusy(true);
    try {
      const { alert: updated } = await apiClient.patch<{ alert: AlertItem }>(`/api/v1/alerts/${alert.id}`, { readState });
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone={SEVERITY_TONE[alert.severity]} label={alert.severity} />
          <span className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
            {CATEGORY_LABELS[alert.category]}
          </span>
          {alert.readState === "new" && <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" aria-label="New" />}
        </div>
        <span className="text-xs text-[var(--text-tertiary)]">{new Date(alert.lastDetectedAt).toLocaleString()}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
        {alert.symbol && <span className="font-numeric mr-1.5">{alert.symbol}</span>}
        {alert.title}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{alert.explanation}</p>
      {alert.sourceUrl && (
        <a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--color-accent)] hover:underline">
          Source
        </a>
      )}

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">{alert.readState}</span>
        {alert.readState !== "acknowledged" && (
          <div className="ml-auto flex gap-2">
            {alert.readState === "new" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setReadState("read")}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] disabled:opacity-50"
              >
                Mark read
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void setReadState("acknowledged")}
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50"
            >
              Acknowledge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertList({ path, emptyDescription }: { path: string; emptyDescription: string }) {
  const result = useApiQuery<{ alerts: AlertItem[] }>(path);
  const [overrides, setOverrides] = useState<Record<string, AlertItem>>({});

  if (result.status === "loading") return <LoadingState label="Loading alerts…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const alerts = result.data.alerts.map((a) => overrides[a.id] ?? a);

  if (alerts.length === 0) {
    return <EmptyState icon="🚨" title="No alerts" description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onUpdated={(updated) => setOverrides((prev) => ({ ...prev, [updated.id]: updated }))} />
      ))}
    </div>
  );
}

const TABS = ["active", "recent", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { active: "Active", recent: "Recent", history: "History" };
const TAB_PATHS: Record<Tab, string> = { active: "/api/v1/alerts/active", recent: "/api/v1/alerts/recent", history: "/api/v1/alerts/history" };
const TAB_EMPTY: Record<Tab, string> = {
  active: "No active alerts — the scheduler hasn't detected anything requiring your attention.",
  recent: "No alerts have fired recently.",
  history: "No alert history yet.",
};

function UpdatesContent() {
  const [tab, setTab] = useState<Tab>("active");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>🚨</span> Updates
      </h1>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-[var(--color-accent)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <AlertList key={tab} path={TAB_PATHS[tab]} emptyDescription={TAB_EMPTY[tab]} />
    </div>
  );
}

export default function UpdatesPage() {
  return (
    <AuthGate>
      <UpdatesContent />
    </AuthGate>
  );
}
