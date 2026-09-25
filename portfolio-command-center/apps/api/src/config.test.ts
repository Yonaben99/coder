import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pcc",
  SESSION_SECRET: "a-short-dev-secret-16",
};

describe("loadConfig", () => {
  it("accepts a short SESSION_SECRET and http APP_BASE_URL in development", () => {
    const config = loadConfig({ ...baseEnv, NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv);
    expect(config.SESSION_SECRET).toBe(baseEnv.SESSION_SECRET);
    expect(config.APP_BASE_URL).toBe("http://localhost:3000");
  });

  it("rejects a SESSION_SECRET under 32 characters in production", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        APP_BASE_URL: "https://app.example.com",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET must be at least 32 characters/);
  });

  it("rejects a non-https APP_BASE_URL in production", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        SESSION_SECRET: "a".repeat(32),
        APP_BASE_URL: "http://app.example.com",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/APP_BASE_URL must be an https:\/\/ URL/);
  });

  it("accepts a strong secret and https URL in production", () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(32),
      APP_BASE_URL: "https://app.example.com",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.NODE_ENV).toBe("production");
  });
});
