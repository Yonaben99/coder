"use client";

import type { ConcentrationSlice, LiveData, PortfolioRiskSummary, RiskMetric, RiskSeverity } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { LiveDataStatusBadge, StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

const SEVERITY_TONE: Record<RiskSeverity, BadgeTone> = { high: "negative", medium: "warning", low: "positive" };

function formatValue(metric: RiskMetric): string {
  if (metric.value === null) return "—";
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "ratio") return metric.value.toFixed(2);
  if (metric.unit === "currency") return metric.value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return String(metric.value);
}

function RiskMetricCard({ metric }: { metric: RiskMetric }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{metric.label}</p>
        {metric.severity && <StatusBadge tone={SEVERITY_TONE[metric.severity]} label={metric.severity} />}
      </div>
      <p className="font-numeric mt-1 text-2xl font-semibold text-[var(--text-primary)]">{formatValue(metric)}</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{metric.explanation}</p>
      <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
        {metric.formula} · {metric.source}
      </p>
    </div>
  );
}

function ConcentrationList({ title, icon, slices }: { title: string; icon: string; slices: ConcentrationSlice[] }) {
  return (
    <section>
      <SectionHeader title={title} icon={icon} />
      {slices.length === 0 ? (
        <EmptyState title="No data" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {slices.map((slice) => (
            <div key={slice.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-[var(--text-secondary)]">{slice.label}</span>
              <div className="h-2 flex-1 rounded-full bg-[var(--surface-overlay)]">
                <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.min(slice.weight, 100)}%` }} />
              </div>
              <span className="font-numeric w-12 shrink-0 text-right text-xs text-[var(--text-tertiary)]">{slice.weight.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RiskContent() {
  const result = useApiQuery<LiveData<PortfolioRiskSummary>>("/api/v1/risk/summary");

  if (result.status === "loading") return <LoadingState label="Computing risk metrics…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const { data, meta } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
          <span aria-hidden>⚠️</span> Risk
        </h1>
        <LiveDataStatusBadge status={meta.status} />
      </div>

      {!data ? (
        <EmptyState
          icon="⚠️"
          title="Risk metrics are not available"
          description={meta.reason ?? "Connect IBKR in Settings → Connections to compute risk metrics from your real holdings."}
        />
      ) : (
        <>
          <section>
            <SectionHeader title="Metrics" icon="📊" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.metrics.map((metric) => (
                <RiskMetricCard key={metric.key} metric={metric} />
              ))}
            </div>
          </section>

          <ConcentrationList title="By Sector" icon="🏭" slices={data.bySector} />
          <ConcentrationList title="By Country" icon="🌎" slices={data.byCountry} />
          <ConcentrationList title="ETF vs. Individual Equity" icon="📦" slices={data.byAssetType} />
          <ConcentrationList title="Top Positions" icon="🔝" slices={data.topPositions} />

          <p className="text-xs text-[var(--text-tertiary)]">
            Every metric is a deterministic calculation from your current holdings — not an investment recommendation. As of{" "}
            {new Date(data.asOf).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}

export default function RiskPage() {
  return (
    <AuthGate>
      <RiskContent />
    </AuthGate>
  );
}
