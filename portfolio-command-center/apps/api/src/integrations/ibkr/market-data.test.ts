import { describe, expect, it } from "vitest";
import { mapMarketDataSnapshot } from "./market-data.js";

describe("mapMarketDataSnapshot", () => {
  it("parses the documented numeric field codes", () => {
    const quote = mapMarketDataSnapshot({ conid: 1, "31": "110.5", "84": "110.0", "86": "111.0", "82": "2.5", "83": "2.3", "87": "1200000" });
    expect(quote.price).toBe(110.5);
    expect(quote.bid).toBe(110.0);
    expect(quote.ask).toBe(111.0);
    expect(quote.change).toBe(2.5);
    expect(quote.changePercent).toBe(2.3);
    expect(quote.volume).toBe(1200000);
  });

  it("strips a leading status character IBKR sometimes prefixes onto the value", () => {
    const quote = mapMarketDataSnapshot({ "31": "C110.5" });
    expect(quote.price).toBe(110.5);
  });

  it("returns null for missing fields instead of 0 or NaN", () => {
    const quote = mapMarketDataSnapshot({});
    expect(quote.price).toBeNull();
    expect(quote.bid).toBeNull();
    expect(quote.volume).toBeNull();
  });

  it("returns null for a non-numeric value rather than throwing", () => {
    const quote = mapMarketDataSnapshot({ "31": "n/a" });
    expect(quote.price).toBeNull();
  });
});
