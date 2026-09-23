import { describe, expect, it } from "vitest";
import { catalystTypeForCategories } from "./category-map.js";

describe("catalystTypeForCategories", () => {
  it("maps a single distinctive category directly", () => {
    expect(catalystTypeForCategories(["earnings"])).toBe("EARNINGS");
    expect(catalystTypeForCategories(["merger_acquisition"])).toBe("MERGER_ACQUISITION");
    expect(catalystTypeForCategories(["analyst_action"])).toBe("ANALYST_REVISION");
  });

  it("picks the first non-OTHER category when multiple are present", () => {
    expect(catalystTypeForCategories(["macro", "earnings", "guidance"])).toBe("EARNINGS");
  });

  it("falls back to OTHER when every category maps to OTHER or the list is empty", () => {
    expect(catalystTypeForCategories(["macro", "price_movement"])).toBe("OTHER");
    expect(catalystTypeForCategories([])).toBe("OTHER");
    expect(catalystTypeForCategories(["other"])).toBe("OTHER");
  });

  it("maps buyback/dividend/financing all to CAPITAL_ALLOCATION", () => {
    expect(catalystTypeForCategories(["buyback"])).toBe("CAPITAL_ALLOCATION");
    expect(catalystTypeForCategories(["dividend"])).toBe("CAPITAL_ALLOCATION");
    expect(catalystTypeForCategories(["financing"])).toBe("CAPITAL_ALLOCATION");
  });
});
