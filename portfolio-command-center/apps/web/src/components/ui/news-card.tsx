import type { NewsItem } from "@pcc/shared";

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4 hover:border-[var(--color-accent)]"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
        <span>{item.symbol ?? "Portfolio-wide"}</span>
        <span>{new Date(item.publishedAt).toLocaleString()}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{item.headline}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.source}</p>
    </a>
  );
}
