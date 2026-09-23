import { describe, expect, it } from "vitest";
import { classifyEarningsError, EarningsError } from "./errors.js";

describe("classifyEarningsError", () => {
  it("classifies connection-refused as unavailable", () => {
    const err = classifyEarningsError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(err.code).toBe("unavailable");
  });

  it("classifies HTTP 401 as invalid_api_key", () => {
    expect(classifyEarningsError({ statusCode: 401 }).code).toBe("invalid_api_key");
  });

  it("classifies HTTP 429 as rate_limited", () => {
    expect(classifyEarningsError({ statusCode: 429 }).code).toBe("rate_limited");
  });

  it("passes an already-classified EarningsError through unchanged", () => {
    const original = new EarningsError("not_configured");
    expect(classifyEarningsError(original)).toBe(original);
  });

  it("never leaks the raw error message (safe messages only)", () => {
    const err = classifyEarningsError({ statusCode: 401, body: { secret: "should-not-leak" } });
    expect(err.message).not.toContain("should-not-leak");
  });
});
