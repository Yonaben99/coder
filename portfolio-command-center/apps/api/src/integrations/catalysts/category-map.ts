import type { NewsCategory } from "@pcc/shared";

/** Maps a Phase 4 news category onto a Phase 5 catalyst type — deliberately reused rather than re-classified, so a news-derived catalyst always agrees with its source article's own category (see docs/RISK_AND_CATALYSTS.md §2). */
export const NEWS_CATEGORY_TO_CATALYST_TYPE: Record<NewsCategory, string> = {
  earnings: "EARNINGS",
  guidance: "GUIDANCE",
  merger_acquisition: "MERGER_ACQUISITION",
  regulation: "REGULATORY_EVENT",
  litigation: "LEGAL_REGULATORY_DECISION",
  management_change: "OTHER",
  product: "PRODUCT_LAUNCH",
  capital_allocation: "CAPITAL_ALLOCATION",
  buyback: "CAPITAL_ALLOCATION",
  dividend: "CAPITAL_ALLOCATION",
  financing: "CAPITAL_ALLOCATION",
  supply_chain: "OTHER",
  customer: "MAJOR_CONTRACT",
  partnership: "MAJOR_CONTRACT",
  macro: "OTHER",
  analyst_action: "ANALYST_REVISION",
  price_movement: "OTHER",
  contract: "MAJOR_CONTRACT",
  other: "OTHER",
};

/** First non-OTHER mapped category wins; an article with no distinctive category maps to OTHER. */
export function catalystTypeForCategories(categories: NewsCategory[]): string {
  for (const category of categories) {
    const type = NEWS_CATEGORY_TO_CATALYST_TYPE[category];
    if (type !== "OTHER") return type;
  }
  return "OTHER";
}
