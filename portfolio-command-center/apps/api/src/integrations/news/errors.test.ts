import { describe, expect, it } from "vitest";
import { classifyNewsError, NewsError } from "./errors.js";

describe("classifyNewsError", () => {
  it("classifies connection-refused as unavailable", () => {
    const err = classifyNewsError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(err.code).toBe("unavailable");
  });

  it("classifies DNS failure as unavailable", () => {
    const err = classifyNewsError(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    expect(err.code).toBe("unavailable");
  });

  it("classifies a timeout code as timeout", () => {
    const err = classifyNewsError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }));
    expect(err.code).toBe("timeout");
  });

  it("classifies HTTP 401 as invalid_api_key", () => {
    const err = classifyNewsError({ statusCode: 401 });
    expect(err.code).toBe("invalid_api_key");
  });

  it("classifies HTTP 403 as invalid_api_key", () => {
    const err = classifyNewsError({ statusCode: 403 });
    expect(err.code).toBe("invalid_api_key");
  });

  it("classifies HTTP 429 as rate_limited", () => {
    const err = classifyNewsError({ statusCode: 429 });
    expect(err.code).toBe("rate_limited");
  });

  it("classifies HTTP 5xx as unavailable", () => {
    const err = classifyNewsError({ statusCode: 503 });
    expect(err.code).toBe("unavailable");
  });

  it("classifies an unrecognized error as unknown_news_error", () => {
    const err = classifyNewsError(new Error("something odd"));
    expect(err.code).toBe("unknown_news_error");
  });

  it("passes an already-classified NewsError through unchanged", () => {
    const original = new NewsError("not_configured");
    expect(classifyNewsError(original)).toBe(original);
  });

  it("never leaks the raw error message to NewsError.message (safe messages only)", () => {
    const err = classifyNewsError({ statusCode: 401, body: { secret: "should-not-leak" } });
    expect(err.message).not.toContain("should-not-leak");
  });
});
