import { describe, expect, it } from "vitest";
import { classifyIbkrError, IbkrError } from "./errors.js";

describe("classifyIbkrError", () => {
  it("classifies connection-refused as gateway_unreachable", () => {
    const err = classifyIbkrError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(err.code).toBe("gateway_unreachable");
  });

  it("classifies DNS failure as gateway_unreachable", () => {
    const err = classifyIbkrError(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    expect(err.code).toBe("gateway_unreachable");
  });

  it("classifies a timeout code as timeout", () => {
    const err = classifyIbkrError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }));
    expect(err.code).toBe("timeout");
  });

  it("classifies HTTP 401 as authentication_required", () => {
    const err = classifyIbkrError({ statusCode: 401 });
    expect(err.code).toBe("authentication_required");
  });

  it("classifies HTTP 403 as authentication_required", () => {
    const err = classifyIbkrError({ statusCode: 403 });
    expect(err.code).toBe("authentication_required");
  });

  it("classifies HTTP 404 as account_unavailable", () => {
    const err = classifyIbkrError({ statusCode: 404 });
    expect(err.code).toBe("account_unavailable");
  });

  it("classifies HTTP 429 as rate_limited", () => {
    const err = classifyIbkrError({ statusCode: 429 });
    expect(err.code).toBe("rate_limited");
  });

  it("classifies HTTP 5xx as unknown_ibkr_error", () => {
    const err = classifyIbkrError({ statusCode: 502 });
    expect(err.code).toBe("unknown_ibkr_error");
  });

  it("classifies an unrecognized error as unknown_ibkr_error", () => {
    const err = classifyIbkrError(new Error("something odd"));
    expect(err.code).toBe("unknown_ibkr_error");
  });

  it("passes an already-classified IbkrError through unchanged", () => {
    const original = new IbkrError("session_expired");
    expect(classifyIbkrError(original)).toBe(original);
  });

  it("never leaks the raw error message to IbkrError.message (safe messages only)", () => {
    const err = classifyIbkrError({ statusCode: 401, body: { secret: "should-not-leak" } });
    expect(err.message).not.toContain("should-not-leak");
  });
});
