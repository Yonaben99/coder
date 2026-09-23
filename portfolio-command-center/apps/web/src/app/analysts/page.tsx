"use client";

import { useState } from "react";
import type { AnalystEstimateSummary, AnalystRevisionItem, LiveData } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveDataStatusBadge } from "@/components/ui/status-badge";
import { SectionHeader } from "@/components/ui/section-header";

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function EstimateCard({ estimate }: { estimate: AnalystEstimateSummary }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <span className="font-numeric text-sm font-semibold text-[var(--text-primary)]">{estimate.symbol}</span>
        {estimate.consensusRating && (
          <span className="rounded-full bg-[var(--color-accent-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]">
            {estimate.consensusRating}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-[var(--text-tertiary)]">Low</p>
          <p className="font-numeric text-sm text-[var(--text-primary)]">{formatCurrency(estimate.lowTarget)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-tertiary)]">Average</p>
          <p className="font-numeric text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(estimate.averageTarget)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-tertiary)]">High</p>
          <p className="font-numeric text-sm text-[var(--text-primary)]">{formatCurrency(estimate.highTarget)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-tertiary)]">
        {estimate.analystCount ?? "—"} analyst{estimate.analystCount === 1 ? "" : "s"} · {estimate.source} via {estimate.provider} · as of{" "}
        {new Date(estimate.asOf).toLocaleDateString()}
      </p>
    </div>
  );
}

function RevisionRow({ revision }: { revision: AnalystRevisionItem }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3">
      <div>
        <p className="text-sm text-[var(--text-primary)]">
          {revision.firm ?? "Analyst"} {revision.ratingChange && <span className="text-[var(--text-tertiary)]">({revision.ratingChange})</span>}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          {revision.previousValue ?? "?"} → {revision.newValue ?? "?"}
        </p>
      </div>
      <span className="text-xs text-[var(--text-tertiary)]">{new Date(revision.revisedAt).toLocaleDateString()}</span>
    </div>
  );
}

function PortfolioTab() {
  const result = useApiQuery<LiveData<AnalystEstimateSummary[]>>("/api/v1/analysts");

  if (result.status === "loading") return <LoadingState label="Loading analyst data…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const { data, meta } = result.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <LiveDataStatusBadge status={meta.status} />
      </div>
      {!data || data.length === 0 ? (
        <EmptyState
          icon="👨‍💼"
          title={meta.status === "unavailable" ? "Analyst data is not connected" : "No analyst data found"}
          description={meta.reason ?? "No analyst coverage found for your current holdings."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.map((estimate) => (
            <EstimateCard key={estimate.symbol} estimate={estimate} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnalystEstimateView({ symbol }: { symbol: string }) {
  const estimate = useApiQuery<LiveData<AnalystEstimateSummary>>(`/api/v1/analysts/${encodeURIComponent(symbol)}`);

  if (estimate.status === "loading") return <LoadingState label="Loading…" />;
  if (estimate.status === "error") return <ErrorState message={estimate.message} />;
  if (estimate.status !== "success") return null;

  return estimate.data.data ? (
    <EstimateCard estimate={estimate.data.data} />
  ) : (
    <EmptyState icon="👨‍💼" title="No analyst data" description={estimate.data.meta.reason ?? `No analyst coverage found for ${symbol}.`} />
  );
}

function AnalystRevisionsView({ symbol }: { symbol: string }) {
  const revisions = useApiQuery<LiveData<AnalystRevisionItem[]>>(`/api/v1/analysts/${encodeURIComponent(symbol)}/revisions`);

  if (revisions.status === "loading") return <LoadingState label="Loading…" />;
  if (revisions.status === "error") return <ErrorState message={revisions.message} />;
  if (revisions.status !== "success") return null;

  return revisions.data.data && revisions.data.data.length > 0 ? (
    <div className="flex flex-col gap-2">
      {revisions.data.data.map((rev) => (
        <RevisionRow key={rev.id} revision={rev} />
      ))}
    </div>
  ) : (
    <EmptyState title="No recent revisions" description={revisions.data.meta.reason ?? `No recent rating changes found for ${symbol}.`} />
  );
}

function BySymbolTab() {
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = input.trim().toUpperCase();
          if (trimmed) setSymbol(trimmed);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ticker symbol, e.g. AAPL"
          className="w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        <button type="submit" className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90">
          Search
        </button>
      </form>

      {!symbol ? (
        <EmptyState icon="🔎" title="Search a symbol" description="Enter a ticker to see its analyst consensus and recent rating changes." />
      ) : (
        <div className="flex flex-col gap-4">
          <section>
            <SectionHeader title="Consensus" icon="🎯" />
            <AnalystEstimateView symbol={symbol} />
          </section>

          <section>
            <SectionHeader title="Recent Revisions" icon="📝" />
            <AnalystRevisionsView symbol={symbol} />
          </section>
        </div>
      )}
    </div>
  );
}

const TABS = ["portfolio", "symbol"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { portfolio: "Portfolio", symbol: "By Symbol" };

function AnalystsContent() {
  const [tab, setTab] = useState<Tab>("portfolio");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>👨‍💼</span> Analysts
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

      {tab === "portfolio" && <PortfolioTab />}
      {tab === "symbol" && <BySymbolTab />}
    </div>
  );
}

export default function AnalystsPage() {
  return (
    <AuthGate>
      <AnalystsContent />
    </AuthGate>
  );
}
