import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@pcc/db";
import { AlertService } from "./alert-service.js";

const RUN = Date.now().toString(36).toUpperCase();
const emailA = `alert-service-a-${RUN}@example.com`;
const emailB = `alert-service-b-${RUN}@example.com`;
let userA: string;
let userB: string;

beforeAll(async () => {
  userA = (await prisma.user.create({ data: { email: emailA, passwordHash: "x" } })).id;
  userB = (await prisma.user.create({ data: { email: emailB, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.alert.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await prisma.alertRule.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.$disconnect();
});

describe("AlertService — rule CRUD", () => {
  it("creates a rule and reads it back with the shared lowercase shape", async () => {
    const service = new AlertService(prisma);
    const rule = await service.createRule(userA, { category: "price_movement", threshold: 5, symbol: "WDC" });
    expect(rule.category).toBe("price_movement");
    expect(rule.threshold).toBe(5);
    expect(rule.symbol).toBe("WDC");
    expect(rule.enabled).toBe(true);
  });

  it("updates a rule in place", async () => {
    const service = new AlertService(prisma);
    const rule = await service.createRule(userA, { category: "pnl_change" });
    const updated = await service.updateRule(userA, rule.id, { enabled: false, threshold: 10 });
    expect(updated?.enabled).toBe(false);
    expect(updated?.threshold).toBe(10);
  });

  it("never lets one user update or delete another user's rule", async () => {
    const service = new AlertService(prisma);
    const rule = await service.createRule(userA, { category: "margin_liquidity_threshold" });

    const updateResult = await service.updateRule(userB, rule.id, { enabled: false });
    expect(updateResult).toBeNull();

    const deleteResult = await service.deleteRule(userB, rule.id);
    expect(deleteResult).toBe(false);

    const stillThere = await service.listRules(userA);
    expect(stillThere.some((r) => r.id === rule.id)).toBe(true);
  });

  it("deletes a rule the owner created", async () => {
    const service = new AlertService(prisma);
    const rule = await service.createRule(userA, { category: "stale_data" });
    const deleted = await service.deleteRule(userA, rule.id);
    expect(deleted).toBe(true);
    const rules = await service.listRules(userA);
    expect(rules.some((r) => r.id === rule.id)).toBe(false);
  });
});

describe("AlertService — alert queries and read-state", () => {
  it("getActiveAlerts only returns TRIGGERED alerts for the given user", async () => {
    const service = new AlertService(prisma);
    await prisma.alert.create({
      data: {
        userId: userA,
        category: "PRICE_MOVEMENT",
        severity: "WARNING",
        title: "Active alert",
        explanation: "test",
        condition: {},
        status: "TRIGGERED",
        dedupeKey: `PRICE_MOVEMENT:ACTIVE-${RUN}`,
      },
    });
    await prisma.alert.create({
      data: {
        userId: userA,
        category: "PRICE_MOVEMENT",
        severity: "WARNING",
        title: "Dismissed alert",
        explanation: "test",
        condition: {},
        status: "DISMISSED",
        dedupeKey: `PRICE_MOVEMENT:DISMISSED-${RUN}`,
      },
    });

    const active = await service.getActiveAlerts(userA);
    expect(active.some((a) => a.title === "Active alert")).toBe(true);
    expect(active.some((a) => a.title === "Dismissed alert")).toBe(false);
  });

  it("setReadState never leaks existence across users", async () => {
    const service = new AlertService(prisma);
    const created = await prisma.alert.create({
      data: {
        userId: userA,
        category: "STALE_DATA",
        severity: "INFO",
        title: "Isolation test",
        explanation: "test",
        condition: {},
        status: "TRIGGERED",
        dedupeKey: `STALE_DATA:ISO-${RUN}`,
      },
    });

    const crossUserResult = await service.setReadState(userB, created.id, "READ");
    expect(crossUserResult).toBeNull();

    const ownerResult = await service.setReadState(userA, created.id, "READ");
    expect(ownerResult?.readState).toBe("read");
  });

  it("acknowledging an alert also dismisses it", async () => {
    const service = new AlertService(prisma);
    const created = await prisma.alert.create({
      data: {
        userId: userA,
        category: "STALE_DATA",
        severity: "INFO",
        title: "Ack test",
        explanation: "test",
        condition: {},
        status: "TRIGGERED",
        dedupeKey: `STALE_DATA:ACK-${RUN}`,
      },
    });

    await service.setReadState(userA, created.id, "ACKNOWLEDGED");
    const row = await prisma.alert.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe("DISMISSED");
    expect(row?.readState).toBe("ACKNOWLEDGED");
  });
});
