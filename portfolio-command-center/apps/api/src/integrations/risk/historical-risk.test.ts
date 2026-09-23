import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@pcc/db";
import { computeHistoricalRiskMetrics } from "./historical-risk.js";

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdEmails: string[] = [];
const instrumentSymbol = `RISKTEST${RUN}`;
let instrumentId: string;

async function makeUser(label: string): Promise<string> {
  const email = `risk-history-${label}-${RUN}@example.com`;
  createdEmails.push(email);
  const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
  return user.id;
}

async function makeSnapshot(userId: string, takenAt: Date, netLiquidation: number, positionWeight: number, marketValue: number): Promise<void> {
  await prisma.portfolioSnapshot.create({
    data: {
      userId,
      takenAt,
      netLiquidation,
      source: "test-fixture",
      positions: {
        create: [{ instrumentId, quantity: 1, weight: positionWeight, marketValue }],
      },
    },
  });
}

beforeAll(async () => {
  const instrument = await prisma.instrument.upsert({ where: { symbol: instrumentSymbol }, create: { symbol: instrumentSymbol }, update: {} });
  instrumentId = instrument.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe("computeHistoricalRiskMetrics — no snapshot history", () => {
  it("reports both metrics as unavailable (null), never a substituted zero", async () => {
    const userId = await makeUser("none");
    const metrics = await computeHistoricalRiskMetrics(prisma, userId);
    expect(metrics).toHaveLength(2);
    for (const metric of metrics) {
      expect(metric.value).toBeNull();
      expect(metric.explanation).toBeTruthy();
    }
  });
});

describe("computeHistoricalRiskMetrics — snapshots too close together", () => {
  it("reports unavailable when no comparison snapshot is at least ~5 days older", async () => {
    const userId = await makeUser("close");
    const now = new Date();
    await makeSnapshot(userId, new Date(now.getTime() - 60 * 60 * 1000), 1000, 50, 500); // 1h ago
    await makeSnapshot(userId, now, 1000, 50, 500);

    const metrics = await computeHistoricalRiskMetrics(prisma, userId);
    for (const metric of metrics) {
      expect(metric.value).toBeNull();
    }
  });
});

describe("computeHistoricalRiskMetrics — two snapshots ~7 days apart", () => {
  it("computes a real exposure and concentration change", async () => {
    const userId = await makeUser("week");
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    await makeSnapshot(userId, weekAgo, 1000, 50, 500); // gross exposure 50%, top-5 concentration 50%
    await makeSnapshot(userId, now, 1000, 80, 800); // gross exposure 80%, top-5 concentration 80%

    const metrics = await computeHistoricalRiskMetrics(prisma, userId);
    const exposureChange = metrics.find((m) => m.key === "exposure_change_7d");
    const concentrationChange = metrics.find((m) => m.key === "concentration_change_7d");

    expect(exposureChange?.value).toBeCloseTo(30, 5);
    expect(concentrationChange?.value).toBeCloseTo(30, 5);
    expect(exposureChange?.asOf).toBeTruthy();
  });
});
