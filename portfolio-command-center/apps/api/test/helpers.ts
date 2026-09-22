import { prisma } from "@pcc/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

export async function createTestApp(): Promise<FastifyInstance> {
  const config = loadConfig();
  return buildApp({ config, prisma });
}

export function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

export { prisma };
