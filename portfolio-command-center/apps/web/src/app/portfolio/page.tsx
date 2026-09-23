"use client";

import Link from "next/link";
import type { LiveData, Position } from "@pcc/shared";
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

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

const COLUMNS: DataTableColumn<Position>[] = [
  { key: "symbol", header: "Ticker", render: (p) => <Link href={`/portfolio/${p.symbol}`} className="text-[var(--color-accent)] hover:underline">{p.symbol}</Link> },
  { key: "shares", header: "Shares", align: "right", render: (p) => p.shares },
  { key: "averageCost", header: "Average Cost", align: "right", render: (p) => formatCurrency(p.averageCost) },
  { key: "currentPrice", header: "Current Price", align: "right", render: (p) => formatCurrency(p.currentPrice) },
  { key: "marketValue", header: "Market Value", align: "right", render: (p) => formatCurrency(p.marketValue) },
  { key: "unrealizedPnl", header: "P&L", align: "right", render: (p) => formatCurrency(p.unrealizedPnl) },
  { key: "unrealizedPnlPercent", header: "P&L %", align: "right", render: (p) => formatPercent(p.unrealizedPnlPercent) },
  { key: "weight", header: "Weight", align: "right", render: (p) => (p.weight !== null ? `${p.weight.toFixed(1)}%` : "—") },
  { key: "dailyChangePercent", header: "Daily Change", align: "right", render: (p) => formatPercent(p.dailyChangePercent) },
];

function PortfolioContent() {
  const positions = useApiQuery<LiveData<Position[]>>("/api/v1/portfolio/positions");

  if (positions.status === "loading") return <LoadingState label="Loading positions…" />;
  if (positions.status === "error") return <ErrorState message={positions.message} />;
  if (positions.status !== "success") return null;

  const rows = positions.data.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Portfolio</h1>
        <LiveDataStatusBadge status={positions.data.meta.status} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Connect IBKR to load your live portfolio."
          description={positions.data.meta.reason}
          action={
            <Link href="/settings/connections" className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90">
              Go to Connections
            </Link>
          }
        />
      ) : (
        <DataTable columns={COLUMNS} rows={rows} getRowKey={(row) => row.symbol} />
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <AuthGate>
      <PortfolioContent />
    </AuthGate>
  );
}
