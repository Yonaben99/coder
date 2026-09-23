import { describe, expect, it } from "vitest";
import { classifyOpenAiError, OpenAiError } from "./errors.js";

describe("classifyOpenAiError", () => {
  it("classifies a 401 as invalid_api_key", () => {
    expect(classifyOpenAiError({ status: 401 }).code).toBe("invalid_api_key");
  });

  it("classifies a 429 as rate_limited", () => {
    expect(classifyOpenAiError({ status: 429 }).code).toBe("rate_limited");
  });

  it("classifies a connection timeout error by name as timeout", () => {
    expect(classifyOpenAiError({ name: "APIConnectionTimeoutError" }).code).toBe("timeout");
  });

  it("classifies a generic connection error by name as unavailable", () => {
    expect(classifyOpenAiError({ name: "APIConnectionError" }).code).toBe("unavailable");
  });

  it("classifies a 500 as unavailable", () => {
    expect(classifyOpenAiError({ status: 500 }).code).toBe("unavailable");
  });

  it("classifies an unrecognized error as unknown_openai_error", () => {
    expect(classifyOpenAiError(new Error("mystery")).code).toBe("unknown_openai_error");
  });

  it("passes an already-classified OpenAiError through unchanged", () => {
    const original = new OpenAiError("rate_limited");
    expect(classifyOpenAiError(original)).toBe(original);
  });

  it("never leaks raw error details into the safe message", () => {
    const err = classifyOpenAiError({ status: 401, message: "sk-supersecretkey rejected" });
    expect(err.message).not.toContain("sk-supersecretkey");
  });
});
