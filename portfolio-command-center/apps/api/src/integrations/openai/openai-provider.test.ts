import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "./openai-provider.js";
import { OpenAiError } from "./errors.js";

// No OPENAI_API_KEY is available in this environment (and must never be
// invented for a test) — so these tests cover the unavailable/not-configured
// state, per the Phase 3 rule: "do not create tests that pretend OpenAI is
// connected." A live call is only ever made when OPENAI_API_KEY is real; see
// docs/OPENAI_INTEGRATION.md for how to run that manually.
describe("OpenAIProvider — not configured (no API key)", () => {
  it("reports isConfigured() false without constructing a client that could make a network call", () => {
    const provider = new OpenAIProvider(null, "gpt-5.4-mini");
    expect(provider.isConfigured()).toBe(false);
  });

  it("getStatus() reflects the unconfigured state honestly", () => {
    const provider = new OpenAIProvider(null, "gpt-5.4-mini");
    const status = provider.getStatus();
    expect(status.configured).toBe(false);
    expect(status.lastSuccessfulCallAt).toBeNull();
    expect(status.lastError).toBeNull();
  });

  it("createResponse rejects with a classified not_configured error rather than attempting a call", async () => {
    const provider = new OpenAIProvider(null, "gpt-5.4-mini");
    await expect(provider.createResponse({ messages: [{ role: "user", content: "hi" }], tools: [] })).rejects.toThrow(OpenAiError);
    await expect(provider.createResponse({ messages: [{ role: "user", content: "hi" }], tools: [] })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("OpenAIProvider — configured with a (fake, non-network) key", () => {
  it("reports isConfigured() true once a key is present", () => {
    // A syntactically-present key is enough to construct the client; this
    // does not make any network call, so no real credentials are involved.
    const provider = new OpenAIProvider("sk-test-not-a-real-key", "gpt-5.4-mini");
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getStatus().configured).toBe(true);
  });
});
