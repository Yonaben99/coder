/**
 * Two layers of deduplication — see docs/NEWS_INTEGRATION.md §8:
 *
 * 1. Exact re-fetch: `NewsArticle` has a unique (provider, externalId)
 *    constraint, so re-fetching the same article (e.g. it shows up again in
 *    a later company-news call) upserts the same row rather than inserting
 *    a duplicate. That's enforced at the DB layer, not here.
 * 2. Cross-query duplicates: the *same* article can arrive under a
 *    different externalId if it's returned by both a symbol query and the
 *    general market query, or re-syndicated. These pure helpers detect
 *    that so the caller (news-service.ts) can mark the second one
 *    `status: DUPLICATE` pointing at the first, keeping both rows (and
 *    both source URLs) rather than discarding data.
 */

/** Strips common tracking params and a trailing slash so trivially-different URLs for the same article compare equal. */
export function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    for (const key of [...params.keys()]) {
      if (/^utm_/.test(key) || ["ref", "src", "cmpid"].includes(key)) params.delete(key);
    }
    parsed.search = params.toString();
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function tokenize(headline: string): Set<string> {
  return new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const HEADLINE_SIMILARITY_THRESHOLD = 0.8;
const SAME_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * True when two articles are likely the same real-world event: very
 * similar headlines, published close together, sharing at least one
 * related symbol. Conservative on purpose — a false "not duplicate" just
 * shows two cards for one event; a false "duplicate" would hide a real,
 * distinct story.
 */
export function isLikelyDuplicate(
  a: { headline: string; publishedAt: Date; relatedSymbols: string[] },
  b: { headline: string; publishedAt: Date; relatedSymbols: string[] },
): boolean {
  const timeDelta = Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime());
  if (timeDelta > SAME_EVENT_WINDOW_MS) return false;

  const sharesSymbol = a.relatedSymbols.some((s) => b.relatedSymbols.includes(s));
  if (!sharesSymbol) return false;

  const similarity = jaccardSimilarity(tokenize(a.headline), tokenize(b.headline));
  return similarity >= HEADLINE_SIMILARITY_THRESHOLD;
}
