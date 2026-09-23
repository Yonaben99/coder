import { describe, expect, it } from "vitest";
import { classifyAnalystError, AnalystError } from "./errors.js";

describe("classifyAnalystError", () => {
  it("classifies connection-refused as unavailable", () => {
    const err = classifyAnalystError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(err.code).toBe("unavailable");
  });

  it("classifies a timeout code as timeout", () => {
    const err = classifyAnalystError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }));
    expect(err.code).toBe("timeout");
  });

  it("classifies HTTP 401/403 as invalid_api_key", () => {
    expect(classifyAnalystError({ statusCode: 401 }).code).toBe("invalid_api_key");
    expect(classifyAnalystError({ statusCode: 403 }).code).toBe("invalid_api_key");
  });

  it("classifies HTTP 429 as rate_limited", () => {
    expect(classifyAnalystError({ statusCode: 429 }).code).toBe("rate_limited");
  });

  it("classifies HTTP 5xx as unavailable", () => {
    expect(classifyAnalystError({ statusCode: 503 }).code).toBe("unavailable");
  });

  it("classifies an unrecognized error as unknown_analyst_error", () => {
    expect(classifyAnalystError(new Error("odd")).code).toBe("unknown_analyst_error");
  });

  it("passes an already-classified AnalystError through unchanged", () => {
    const original = new AnalystError("not_configured");
    expect(classifyAnalystError(original)).toBe(original);
  });

  it("never leaks the raw error message (safe messages only)", () => {
    const err = classifyAnalystError({ statusCode: 401, body: { secret: "should-not-leak" } });
    expect(err.message).not.toContain("should-not-leak");
  });
});
