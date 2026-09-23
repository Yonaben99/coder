import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt.js";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("sets Hebrew as the default response language", () => {
    expect(prompt).toMatch(/Hebrew/);
  });

  it("states the anti-invention rule explicitly", () => {
    expect(prompt.toLowerCase()).toContain("never invent");
  });

  it("instructs the model to re-call tools rather than reuse conversation memory for current state", () => {
    expect(prompt).toMatch(/always call the relevant tool again/i);
  });

  it("includes every required claim-labeling category", () => {
    for (const label of ["FACT", "CURRENT DATA", "ANALYST ESTIMATE", "AI INTERPRETATION", "SCENARIO", "UNCERTAINTY"]) {
      expect(prompt).toContain(label);
    }
  });

  it("states the assistant is read-only and cannot place orders", () => {
    expect(prompt.toLowerCase()).toContain("read-only");
  });
});
