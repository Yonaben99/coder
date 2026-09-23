import { describe, expect, it } from "vitest";
import { classifyNewsText } from "./categorizer.js";

describe("classifyNewsText", () => {
  it("classifies an earnings headline as high relevance", () => {
    const { categories, relevance } = classifyNewsText("Western Digital reports quarterly results, beats EPS estimates", null);
    expect(categories).toContain("earnings");
    expect(relevance).toBe("high");
  });

  it("classifies a dividend headline as medium relevance", () => {
    const { categories, relevance } = classifyNewsText("Company announces quarterly dividend increase", null);
    expect(categories).toContain("dividend");
    expect(relevance).toBe("medium");
  });

  it("classifies an unrecognized headline as other/low", () => {
    const { categories, relevance } = classifyNewsText("Local bakery celebrates 10th anniversary", null);
    expect(categories).toEqual(["other"]);
    expect(relevance).toBe("low");
  });

  it("matches keywords in the summary as well as the headline", () => {
    const { categories } = classifyNewsText("Company update", "The board approved a new share repurchase program.");
    expect(categories).toContain("buyback");
  });

  it("assigns high relevance when any matched category is high-relevance, even alongside medium ones", () => {
    const { categories, relevance } = classifyNewsText(
      "CEO resigns amid restructuring and cost-cutting plan",
      null,
    );
    expect(categories).toEqual(expect.arrayContaining(["management_change", "capital_allocation"]));
    expect(relevance).toBe("high");
  });

  it("is case-insensitive", () => {
    const { categories } = classifyNewsText("COMPANY ANNOUNCES MERGER WITH RIVAL FIRM", null);
    expect(categories).toContain("merger_acquisition");
  });

  it("can match multiple categories on one headline", () => {
    const { categories } = classifyNewsText("Company upgrades guidance after earnings beat, analyst raises price target", null);
    expect(categories).toEqual(expect.arrayContaining(["earnings", "guidance", "analyst_action"]));
  });
});
