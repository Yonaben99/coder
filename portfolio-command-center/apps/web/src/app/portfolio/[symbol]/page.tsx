"use client";

import { use } from "react";
import type { LiveData, Position } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { LiveDataStatusBadge } from "@/components/ui/status-badge";

const PENDING_SECTIONS: { title: string; icon: string; note: string }[] = [
  { title: "News", icon: "📰", note: "News integration pending (Phase 4)." },
  { title: "Analysts", icon: "👨‍💼", note: "Analyst data integration pending (Phase 4)." },
  { title: "Earnings", icon: "🗓️", note: "Earnings data integration pending (Phase 4)." },
  { title: "Catalysts", icon: "📅", note: "Catalyst tracking pending (Phase 5)." },
  { title: "Risks", icon: "⚠️", note: "Risk analysis pending (Phase 5)." },
  { title: "AI Analysis", icon: "💬", note: "Portfolio AI integration pending (Phase 3)." },
];

function formatCurrency(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function PositionDetailContent({ symbol }: { symbol: string }) {
  const positions = useApiQuery<LiveData<Position[]>>("/api/v1/portfolio/positions");

  if (positions.status === "loading") return <LoadingState label="Loading position…" />;
  if (positions.status === "error") return <ErrorState message={positions.message} />;
  if (positions.status !== "success") return null;

  const position = positions.data.data?.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
  const meta = positions.data.meta;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-numeric text-xl font-semibold text-[var(--text-primary)]">{symbol.toUpperCase()}</h1>
          {position?.description && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{position.description}</p>}
        </div>
        <LiveDataStatusBadge status={meta.status} />
      </header>

      {!position ? (
        <EmptyState
          icon="📦"
          title="No live position selected."
          description={
            meta.status === "unavailable"
              ? (meta.reason ?? "Connect IBKR to load real data for this symbol.")
              : `${symbol.toUpperCase()} was not found in your current IBKR positions.`
          }
        />
      ) : (
        <section>
          <SectionHeader title="Position" icon="📦" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Quantity" value={String(position.shares)} meta={meta} />
            <MetricCard label="Average Cost" value={formatCurrency(position.averageCost)} meta={meta} />
            <MetricCard label="Current Price" value={formatCurrency(position.currentPrice)} meta={meta} />
            <MetricCard label="Market Value" value={formatCurrency(position.marketValue)} meta={meta} />
            <MetricCard
              label="Unrealized P&L"
              value={formatCurrency(position.unrealizedPnl)}
              meta={meta}
              tone={(position.unrealizedPnl ?? 0) >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              label="P&L %"
              value={formatPercent(position.unrealizedPnlPercent)}
              meta={meta}
              tone={(position.unrealizedPnlPercent ?? 0) >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              label="Daily Change"
              value={formatPercent(position.dailyChangePercent)}
              meta={meta}
              tone={(position.dailyChangePercent ?? 0) >= 0 ? "positive" : "negative"}
            />
            <MetricCard label="Portfolio Weight" value={position.weight !== null ? `${position.weight.toFixed(1)}%` : null} meta={meta} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PENDING_SECTIONS.map((section) => (
          <section key={section.title}>
            <SectionHeader title={section.title} icon={section.icon} />
            <EmptyState title={section.note} />
          </section>
        ))}
      </div>
    </div>
  );
}

export default function PositionDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  return (
    <AuthGate>
      <PositionDetailContent symbol={symbol} />
    </AuthGate>
  );
}
