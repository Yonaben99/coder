import { describe, expect, it } from "vitest";
import { normalizeFinnhubEarnings } from "./normalizer.js";
import type { FinnhubEarningsEntry } from "./types.js";

const BASE: FinnhubEarningsEntry = {
  symbol: "WDC",
  date: "2026-04-15",
  year: 2026,
  quarter: 2,
  hour: "amc",
  epsEstimate: 1.5,
  epsActual: null,
  revenueEstimate: 4_000_000_000,
  revenueActual: null,
};

describe("normalizeFinnhubEarnings", () => {
  it("maps period/date/timing/estimates straight through", () => {
    const result = normalizeFinnhubEarnings(BASE);
    expect(result.period).toBe("Q2 2026");
    expect(result.reportDate?.toISOString().slice(0, 10)).toBe("2026-04-15");
    expect(result.announcementTiming).toBe("amc");
    expect(result.estimatedEps).toBe(1.5);
    expect(result.estimatedRevenue).toBe(4_000_000_000);
  });

  it("produces a stable externalId keyed by symbol/year/quarter", () => {
    expect(normalizeFinnhubEarnings(BASE).externalId).toBe("WDC-2026-Q2");
  });

  it("classifies status ESTIMATED when no actuals are present", () => {
    expect(normalizeFinnhubEarnings(BASE).status).toBe("ESTIMATED");
  });

  it("classifies status ACTUAL once either actual figure is present", () => {
    const withActualEps = normalizeFinnhubEarnings({ ...BASE, epsActual: 1.6 });
    expect(withActualEps.status).toBe("ACTUAL");

    const withActualRevenue = normalizeFinnhubEarnings({ ...BASE, revenueActual: 4_100_000_000 });
    expect(withActualRevenue.status).toBe("ACTUAL");
  });
});
