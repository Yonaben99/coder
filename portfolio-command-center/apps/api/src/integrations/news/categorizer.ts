import type { NewsCategory, NewsRelevance } from "@pcc/shared";

/**
 * Deterministic keyword classifier — no AI involved. Runs once per article
 * at normalization time so the same article always gets the same category
 * set regardless of which tool or page reads it later. See
 * docs/NEWS_INTEGRATION.md §7 for the full rule table and rationale.
 *
 * This assigns an information-relevance category and level, not an
 * investment recommendation — "high" means "likely material to read," not
 * "buy" or "sell."
 */
const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  earnings: ["earnings", "quarterly results", "q1 results", "q2 results", "q3 results", "q4 results", "eps", "revenue beat", "revenue miss"],
  guidance: ["guidance", "forecast", "outlook raised", "outlook lowered", "raises outlook", "cuts outlook", "full-year guidance"],
  merger_acquisition: ["acquire", "acquisition", "merger", "to be acquired", "buyout", "takeover", "acquires"],
  regulation: ["regulator", "regulatory", "sec investigation", "antitrust", "fda", "ftc", "compliance violation", "sanction"],
  litigation: ["lawsuit", "sues", "sued", "litigation", "class action", "settlement", "court ruling"],
  management_change: ["ceo", "cfo", "chief executive", "chief financial officer", "resigns", "steps down", "appoints", "names new"],
  product: ["launches", "unveils", "announces new product", "new product", "product recall", "recalls"],
  capital_allocation: ["capital allocation", "share repurchase program", "restructuring", "cost-cutting", "layoffs"],
  buyback: ["buyback", "share repurchase", "repurchase program", "stock repurchase"],
  dividend: ["dividend", "special dividend", "dividend increase", "dividend cut", "quarterly dividend"],
  financing: ["debt offering", "bond offering", "secondary offering", "raises capital", "credit facility", "refinances"],
  supply_chain: ["supply chain", "shortage", "supplier", "chip shortage", "logistics disruption"],
  customer: ["customer win", "loses customer", "major customer", "customer contract"],
  partnership: ["partnership", "partners with", "collaboration", "joint venture", "teams up"],
  macro: ["federal reserve", "interest rate", "inflation", "gdp", "jobs report", "cpi report", "recession"],
  analyst_action: ["upgrade", "downgrade", "price target", "initiates coverage", "reiterates"],
  price_movement: ["shares surge", "shares plunge", "shares jump", "shares fall", "stock soars", "stock tumbles", "52-week high", "52-week low"],
  contract: ["contract award", "wins contract", "awarded contract", "signs contract"],
  other: [],
};

const HIGH_RELEVANCE_CATEGORIES = new Set<NewsCategory>([
  "earnings",
  "guidance",
  "merger_acquisition",
  "regulation",
  "litigation",
  "management_change",
  "analyst_action",
  "price_movement",
]);

const MEDIUM_RELEVANCE_CATEGORIES = new Set<NewsCategory>([
  "product",
  "capital_allocation",
  "buyback",
  "dividend",
  "financing",
  "supply_chain",
  "customer",
  "partnership",
  "contract",
]);

export function classifyNewsText(headline: string, summary: string | null): { categories: NewsCategory[]; relevance: NewsRelevance } {
  const text = `${headline} ${summary ?? ""}`.toLowerCase();
  const categories = (Object.keys(CATEGORY_KEYWORDS) as NewsCategory[]).filter(
    (category) => category !== "other" && CATEGORY_KEYWORDS[category].some((keyword) => text.includes(keyword)),
  );

  if (categories.length === 0) {
    return { categories: ["other"], relevance: "low" };
  }

  const relevance: NewsRelevance = categories.some((c) => HIGH_RELEVANCE_CATEGORIES.has(c))
    ? "high"
    : categories.some((c) => MEDIUM_RELEVANCE_CATEGORIES.has(c))
      ? "medium"
      : "low";

  return { categories, relevance };
}
