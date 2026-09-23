"use client";

import { useState } from "react";
import type { LiveData, NewsCategory, NewsItem, PortfolioNewsSummary } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveDataStatusBadge } from "@/components/ui/status-badge";
import { NewsCard, CATEGORY_LABELS } from "@/components/ui/news-card";

const TABS = ["latest", "portfolio", "symbol", "categories"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  latest: "Latest",
  portfolio: "Portfolio",
  symbol: "By Symbol",
  categories: "Categories",
};

function NewsList({ path, emptyDescription }: { path: string; emptyDescription: string }) {
  const result = useApiQuery<LiveData<NewsItem[]>>(path);

  if (result.status === "loading") return <LoadingState label="Loading news…" />;
  if (result.status === "error") return <ErrorState message={result.message} />;
  if (result.status !== "success") return null;

  const { data, meta } = result.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <LiveDataStatusBadge status={meta.status} />
        {meta.timestamp && <span className="text-xs text-[var(--text-tertiary)]">as of {new Date(meta.timestamp).toLocaleString()}</span>}
      </div>

      {!data || data.length === 0 ? (
        <EmptyState icon="📰" title={meta.status === "unavailable" ? "News is not connected" : "No news found"} description={meta.reason ?? emptyDescription} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioTab() {
  const summary = useApiQuery<LiveData<PortfolioNewsSummary[]>>("/api/v1/news/portfolio/summary");

  return (
    <div className="flex flex-col gap-4">
      {summary.status === "success" && summary.data.data && summary.data.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.data.data.map((s) => (
            <span
              key={s.symbol}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-secondary)]"
            >
              {s.symbol}: {s.updateCount} update{s.updateCount === 1 ? "" : "s"}
            </span>
          ))}
        </div>
      )}
      <NewsList path="/api/v1/news/portfolio?limit=50" emptyDescription="No recent news for your current holdings." />
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
        <button
          type="submit"
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90"
        >
          Search
        </button>
      </form>

      {symbol ? (
        <NewsList path={`/api/v1/news/symbol/${encodeURIComponent(symbol)}?limit=20`} emptyDescription={`No recent news found for ${symbol}.`} />
      ) : (
        <EmptyState icon="🔎" title="Search a symbol" description="Enter a ticker to see its recent news, whether or not it's currently held." />
      )}
    </div>
  );
}

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as NewsCategory[]).filter((c) => c !== "other");

function CategoriesTab() {
  const [category, setCategory] = useState<NewsCategory>("earnings");

  return (
    <div className="flex flex-col gap-4">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as NewsCategory)}
        className="w-56 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
      >
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>

      <NewsList
        path={`/api/v1/news?category=${encodeURIComponent(category)}&limit=50`}
        emptyDescription={`No recent ${CATEGORY_LABELS[category].toLowerCase()} news found.`}
      />
    </div>
  );
}

function NewsContent() {
  const [tab, setTab] = useState<Tab>("latest");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>📰</span> News
      </h1>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-[var(--color-accent)] text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "latest" && <NewsList path="/api/v1/news/recent?limit=30" emptyDescription="No recent market news found." />}
      {tab === "portfolio" && <PortfolioTab />}
      {tab === "symbol" && <BySymbolTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}

export default function NewsPage() {
  return (
    <AuthGate>
      <NewsContent />
    </AuthGate>
  );
}
