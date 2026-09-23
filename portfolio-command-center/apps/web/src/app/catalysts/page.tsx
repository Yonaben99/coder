"use client";

import { useState } from "react";
import type { Catalyst, CatalystType, LiveData } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveDataStatusBadge, StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

const TYPE_LABELS: Record<CatalystType, string> = {
  earnings: "Earnings",
  guidance: "Guidance",
  product_launch: "Product launch",
  major_contract: "Major contract",
  regulatory_event: "Regulatory event",
  merger_acquisition: "M&A",
  investor_day: "Investor day",
  capital_allocation: "Capital allocation",
  legal_regulatory_decision: "Legal/regulatory decision",
  analyst_revision: "Analyst revision",
  other: "Other",
};

const RELEVANCE_TONE: Record<string, BadgeTone> = { high: "warning", medium: "accent", low: "neutral" };

function CatalystCard({ catalyst }: { catalyst: Catalyst }) {
  const body = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4 hover:border-[var(--color-accent)]">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
        <span>{catalyst.symbol ?? "Portfolio-wide"}</span>
        <span>{catalyst.expectedDate ? new Date(catalyst.expectedDate).toLocaleDateString() : "Date unknown"}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{catalyst.title}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{catalyst.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">{TYPE_LABELS[catalyst.type]}</span>
        <span className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
          {catalyst.status === "upcoming" ? "Upcoming" : "Completed"}
        </span>
        <span className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
          {catalyst.dateConfirmed ? "Date confirmed" : "Date estimated"}
        </span>
        {catalyst.relevance && <StatusBadge tone={RELEVANCE_TONE[catalyst.relevance] ?? "neutral"} label={`${catalyst.relevance} relevance`} />}
      </div>
      {catalyst.source && <p className="mt-2 text-xs text-[var(--text-tertiary)]">Source: {catalyst.source}</p>}
    </div>
  );

  return catalyst.url ? (
    <a href={catalyst.url} target="_blank" rel="noreferrer" className="block">
      {body}
    </a>
  ) : (
    body
  );
}

function CatalystList({ path, emptyDescription }: { path: string; emptyDescription: string }) {
  const result = useApiQuery<LiveData<Catalyst[]>>(path);

  if (result.status === "loading") return <LoadingState label="Loading catalysts…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const { data, meta } = result.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <LiveDataStatusBadge status={meta.status} />
      </div>
      {!data || data.length === 0 ? (
        <EmptyState icon="📅" title={meta.status === "unavailable" ? "Catalyst data is not connected" : "No catalysts found"} description={meta.reason ?? emptyDescription} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((catalyst) => (
            <CatalystCard key={catalyst.id} catalyst={catalyst} />
          ))}
        </div>
      )}
    </div>
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

      {symbol ? (
        <CatalystList path={`/api/v1/catalysts/symbol/${encodeURIComponent(symbol)}`} emptyDescription={`No catalysts found for ${symbol}.`} />
      ) : (
        <EmptyState icon="🔎" title="Search a symbol" description="Enter a ticker to see its upcoming and recent catalyst events." />
      )}
    </div>
  );
}

const TABS = ["portfolio", "symbol"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { portfolio: "Portfolio", symbol: "By Symbol" };

function CatalystsContent() {
  const [tab, setTab] = useState<Tab>("portfolio");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>📅</span> Catalysts
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

      {tab === "portfolio" && <CatalystList path="/api/v1/catalysts/portfolio" emptyDescription="No recent or upcoming catalysts found for your current holdings." />}
      {tab === "symbol" && <BySymbolTab />}
    </div>
  );
}

export default function CatalystsPage() {
  return (
    <AuthGate>
      <CatalystsContent />
    </AuthGate>
  );
}
