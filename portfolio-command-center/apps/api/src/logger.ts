import type { FastifyBaseLogger } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger.js";
import type { AppConfig } from "./config.js";

/**
 * Paths pino redacts to "[Redacted]" before a log line is ever written.
 * This is enforced at the logger, not left to call sites to remember not to
 * log a secret — see SECURITY.md §1 and §6.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.newPassword",
  "req.body.totpSecret",
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.token',
  '*.apiKey',
];

export function buildLoggerOptions(config: AppConfig): PinoLoggerOptions {
  return {
    level: config.NODE_ENV === "test" ? "silent" : "info",
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    transport:
      config.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
        : undefined,
  };
}

export type Logger = FastifyBaseLogger;
