import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@pcc/db";

describe("database connection", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to Postgres and can round-trip a query", async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    expect(result[0]?.value).toBe(1);
  });

  it("has the User table available after migration", async () => {
    await expect(prisma.user.count()).resolves.toEqual(expect.any(Number));
  });
});
