import { loadEnv } from "@pcc/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Optional: unset means the integration is "not_configured", not "failed".
  IBKR_GATEWAY_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // gpt-5.4-mini: current-generation, cost-effective, supports tool calling.
  // Never assume this stays available forever — override via env instead of
  // changing this default when it's retired. See docs/OPENAI_INTEGRATION.md.
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  MARKET_INTEL_PROVIDER: z.string().optional(),
  MARKET_INTEL_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return loadEnv(envSchema, source);
}
