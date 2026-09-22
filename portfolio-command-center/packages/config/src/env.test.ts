import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvValidationError, isSecretFieldName, loadEnv } from "./env";

describe("loadEnv", () => {
  const schema = z.object({ PORT: z.coerce.number() });

  it("parses valid env", () => {
    expect(loadEnv(schema, { PORT: "4000" } as unknown as NodeJS.ProcessEnv)).toEqual({ PORT: 4000 });
  });

  it("throws a readable EnvValidationError for invalid env", () => {
    expect(() => loadEnv(schema, {} as NodeJS.ProcessEnv)).toThrow(EnvValidationError);
  });
});

describe("isSecretFieldName", () => {
  it("flags obviously secret-shaped field names", () => {
    expect(isSecretFieldName("openaiApiKey")).toBe(true);
    expect(isSecretFieldName("password")).toBe(true);
    expect(isSecretFieldName("symbol")).toBe(false);
  });
});
