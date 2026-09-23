import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pccPrisma: PrismaClient | undefined;
}

// Reuse a single client across hot reloads in dev instead of exhausting
// Postgres connections with a new client per module reload.
export const prisma = globalThis.__pccPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pccPrisma = prisma;
}

export * from "@prisma/client";
