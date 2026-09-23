import type { NewsCategory, NewsRelevance } from "@pcc/shared";
import { classifyNewsText } from "./categorizer.js";
import type { FinnhubNewsArticle } from "./types.js";

export interface NormalizedArticle {
  provider: string;
  externalId: string;
  headline: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: Date;
  relatedSymbols: string[];
  categories: NewsCategory[];
  relevance: NewsRelevance;
}

/**
 * Maps a raw Finnhub article to our normalized shape, ready for DB upsert.
 * `queriedSymbol` (when this came from a company-news call) is always
 * included in relatedSymbols even if Finnhub's own `related` field is
 * empty or differently formatted — we asked about this symbol, so it's
 * related by construction.
 */
export function normalizeFinnhubArticle(raw: FinnhubNewsArticle, queriedSymbol: string | null): NormalizedArticle {
  const relatedSymbols = new Set<string>();
  if (queriedSymbol) relatedSymbols.add(queriedSymbol.toUpperCase());
  if (raw.related) {
    for (const symbol of raw.related.split(",")) {
      const trimmed = symbol.trim().toUpperCase();
      if (trimmed) relatedSymbols.add(trimmed);
    }
  }

  const { categories, relevance } = classifyNewsText(raw.headline, raw.summary ?? null);

  return {
    provider: "finnhub",
    externalId: String(raw.id),
    headline: raw.headline,
    summary: raw.summary?.trim() || null,
    source: raw.source,
    url: raw.url,
    publishedAt: new Date(raw.datetime * 1000),
    relatedSymbols: [...relatedSymbols],
    categories,
    relevance,
  };
}
