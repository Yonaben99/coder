"use client";

import Link from "next/link";
import type { AccountSummary, ConnectionInfo, LiveData } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { MetricCard } from "@/components/ui/metric-card";
import { IntegrationStatusBadge } from "@/components/ui/status-badge";

function formatCurrency(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function HomeContent() {
  const summary = useApiQuery<LiveData<AccountSummary>>("/api/v1/portfolio/summary");
  const connections = useApiQuery<{ connections: ConnectionInfo[] }>("/api/v1/connections");

  const ibkr = connections.status === "success" ? connections.data.connections.find((c) => c.key === "ibkr") : null;
  const account = summary.status === "success" ? summary.data.data : null;
  const hint = summary.status === "success" && summary.data.meta.status === "unavailable" ? "Waiting for IBKR connection" : undefined;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
          <span aria-hidden>📊</span> Portfolio Command Center
        </h1>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>IBKR</span>
          {ibkr ? <IntegrationStatusBadge status={ibkr.status} /> : <span className="text-[var(--text-tertiary)]">—</span>}
        </div>
      </header>

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Portfolio Value" value={formatCurrency(account?.netLiquidation ?? null)} hint={hint} />
          <MetricCard label="Daily P&L" value={formatCurrency(account?.dailyPnl ?? null)} hint={hint} />
          <MetricCard label="YTD" value={formatCurrency(account?.ytdPnl ?? null)} hint={hint} />
          <MetricCard label="Cash" value={formatCurrency(account?.cash ?? null)} hint={hint} />
          <MetricCard label="Buying Power" value={formatCurrency(account?.buyingPower ?? null)} hint={hint} />
          <MetricCard label="Excess Liquidity" value={formatCurrency(account?.excessLiquidity ?? null)} hint={hint} />
          <MetricCard label="Margin" value={formatCurrency(account?.margin ?? null)} hint={hint} />
          <MetricCard label="Leverage" value={account?.leverage != null ? `${account.leverage.toFixed(2)}x` : null} hint={hint} />
        </div>
        {summary.status === "loading" && <div className="mt-3"><LoadingState label="Loading account summary…" /></div>}
        {summary.status === "error" && <div className="mt-3"><ErrorState message={summary.message} /></div>}
      </section>

      <section>
        <SectionHeader title="Attention" icon="🚨" />
        <EmptyState title="No live portfolio data available yet." description="Connect IBKR in Settings → Connections to see what needs your attention." />
      </section>

      <section>
        <SectionHeader title="Top Movers" icon="📈" />
        <EmptyState title="Waiting for market data." />
      </section>

      <section>
        <SectionHeader title="Latest News" icon="📰" />
        <EmptyState title="News integration pending." />
      </section>

      <section>
        <SectionHeader title="Upcoming" icon="📅" />
        <EmptyState title="Catalyst integration pending." />
      </section>

      <section className="pb-4">
        <Link
          href="/ai"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-black hover:opacity-90"
        >
          💬 Ask Portfolio AI
        </Link>
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}
