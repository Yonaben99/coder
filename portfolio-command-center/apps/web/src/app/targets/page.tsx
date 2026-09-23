"use client";

import type { AnalystEstimateSummary, LiveData } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { LiveDataStatusBadge } from "@/components/ui/status-badge";

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const COLUMNS: DataTableColumn<AnalystEstimateSummary>[] = [
  { key: "symbol", header: "Symbol", render: (e) => e.symbol },
  { key: "low", header: "Low Target", align: "right", render: (e) => formatCurrency(e.lowTarget) },
  { key: "average", header: "Average Target", align: "right", render: (e) => formatCurrency(e.averageTarget) },
  { key: "high", header: "High Target", align: "right", render: (e) => formatCurrency(e.highTarget) },
  { key: "rating", header: "Consensus", render: (e) => e.consensusRating ?? "—" },
  { key: "count", header: "Analysts", align: "right", render: (e) => e.analystCount ?? "—" },
  { key: "asOf", header: "As Of", render: (e) => new Date(e.asOf).toLocaleDateString() },
];

function TargetsContent() {
  const result = useApiQuery<LiveData<AnalystEstimateSummary[]>>("/api/v1/analysts");

  if (result.status === "loading") return <LoadingState label="Loading price targets…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const { data, meta } = result.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
          <span aria-hidden>🎯</span> Targets
        </h1>
        <LiveDataStatusBadge status={meta.status} />
      </div>

      {!data || data.length === 0 ? (
        <EmptyState
          icon="🎯"
          title={meta.status === "unavailable" ? "Analyst data is not connected" : "No price targets found"}
          description={meta.reason ?? "No analyst price targets found for your current holdings."}
        />
      ) : (
        <DataTable columns={COLUMNS} rows={data} getRowKey={(row) => row.symbol} />
      )}
    </div>
  );
}

export default function TargetsPage() {
  return (
    <AuthGate>
      <TargetsContent />
    </AuthGate>
  );
}
