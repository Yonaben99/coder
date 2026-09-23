import { describe, expect, it } from "vitest";
import { unavailable } from "./live-data";

describe("unavailable", () => {
  it("produces a null-data envelope with the given source and reason", () => {
    const result = unavailable<number>("IBKR", "session expired");

    expect(result.data).toBeNull();
    expect(result.meta).toEqual({
      source: "IBKR",
      timestamp: null,
      status: "unavailable",
      reason: "session expired",
    });
  });
});
