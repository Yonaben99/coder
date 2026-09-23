import type { NewsCategory, NewsItem, NewsRelevance } from "@pcc/shared";
import { StatusBadge, type BadgeTone } from "./status-badge";

const RELEVANCE_TONE: Record<NewsRelevance, BadgeTone> = {
  high: "warning",
  medium: "accent",
  low: "neutral",
};

const RELEVANCE_LABEL: Record<NewsRelevance, string> = {
  high: "High relevance",
  medium: "Medium relevance",
  low: "Low relevance",
};

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  earnings: "Earnings",
  guidance: "Guidance",
  merger_acquisition: "M&A",
  regulation: "Regulation",
  litigation: "Litigation",
  management_change: "Management change",
  product: "Product",
  capital_allocation: "Capital allocation",
  buyback: "Buyback",
  dividend: "Dividend",
  financing: "Financing",
  supply_chain: "Supply chain",
  customer: "Customer",
  partnership: "Partnership",
  macro: "Macro",
  analyst_action: "Analyst action",
  price_movement: "Price movement",
  contract: "Contract",
  other: "Other",
};

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4 hover:border-[var(--color-accent)]"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
        <span>{item.symbol ?? (item.relatedSymbols.length > 0 ? item.relatedSymbols.join(", ") : "Market-wide")}</span>
        <span>{new Date(item.publishedAt).toLocaleString()}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{item.headline}</p>
      {item.summary && <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{item.summary}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.relevance && <StatusBadge tone={RELEVANCE_TONE[item.relevance]} label={RELEVANCE_LABEL[item.relevance]} />}
        {item.categories
          .filter((c) => c !== "other")
          .map((category) => (
            <span
              key={category}
              className="rounded-full bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]"
            >
              {CATEGORY_LABELS[category]}
            </span>
          ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        {item.source} via {item.provider} · retrieved {new Date(item.retrievedAt).toLocaleString()}
      </p>
    </a>
  );
}
