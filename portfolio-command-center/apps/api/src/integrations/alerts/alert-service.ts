import type { Alert as DbAlert, AlertReadState, AlertRule as DbAlertRule, PrismaClient } from "@pcc/db";
import type { AlertItem, AlertRuleConfig } from "@pcc/shared";

function toAlertItem(row: DbAlert): AlertItem {
  return {
    id: row.id,
    category: row.category.toLowerCase() as AlertItem["category"],
    symbol: row.symbol,
    severity: row.severity.toLowerCase() as AlertItem["severity"],
    title: row.title,
    explanation: row.explanation,
    sourceUrl: row.sourceUrl,
    readState: row.readState.toLowerCase() as AlertItem["readState"],
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    lastDetectedAt: row.lastDetectedAt.toISOString(),
  };
}

function toRuleConfig(row: DbAlertRule): AlertRuleConfig {
  return {
    id: row.id,
    category: row.category.toLowerCase() as AlertRuleConfig["category"],
    symbol: row.symbol,
    enabled: row.enabled,
    threshold: row.threshold !== null ? Number(row.threshold) : null,
    severity: row.severity.toLowerCase() as AlertRuleConfig["severity"],
    cooldownMinutes: row.cooldownMinutes,
    notifyInApp: row.notifyInApp,
  };
}

/**
 * Read/write side of alerts — queries and user-facing mutations (mark
 * read/acknowledged, rule CRUD). Detection itself lives in AlertEngine;
 * this class never runs a detector, only reads/updates what AlertEngine
 * already wrote. Every method is scoped to the given userId — one user's
 * alerts and rules are never visible to another.
 */
export class AlertService {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveAlerts(userId: string, limit = 50): Promise<AlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { userId, status: "TRIGGERED" },
      orderBy: { lastDetectedAt: "desc" },
      take: limit,
    });
    return rows.map(toAlertItem);
  }

  async getRecentAlerts(userId: string, limit = 20): Promise<AlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { userId },
      orderBy: { lastDetectedAt: "desc" },
      take: limit,
    });
    return rows.map(toAlertItem);
  }

  async getAlertHistory(userId: string, limit = 100): Promise<AlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { userId },
      orderBy: { firstDetectedAt: "desc" },
      take: limit,
    });
    return rows.map(toAlertItem);
  }

  /** Returns null if the alert doesn't exist or belongs to a different user — never leaks existence across users. */
  async setReadState(userId: string, alertId: string, readState: AlertReadState): Promise<AlertItem | null> {
    const existing = await this.prisma.alert.findFirst({ where: { id: alertId, userId } });
    if (!existing) return null;
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { readState, status: readState === "ACKNOWLEDGED" ? "DISMISSED" : existing.status },
    });
    return toAlertItem(updated);
  }

  async listRules(userId: string): Promise<AlertRuleConfig[]> {
    const rows = await this.prisma.alertRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return rows.map(toRuleConfig);
  }

  async createRule(userId: string, input: Partial<AlertRuleConfig> & Pick<AlertRuleConfig, "category">): Promise<AlertRuleConfig> {
    const row = await this.prisma.alertRule.create({
      data: {
        userId,
        category: input.category.toUpperCase() as DbAlertRule["category"],
        symbol: input.symbol ?? null,
        enabled: input.enabled ?? true,
        threshold: input.threshold ?? null,
        severity: (input.severity?.toUpperCase() as DbAlertRule["severity"]) ?? "WARNING",
        cooldownMinutes: input.cooldownMinutes ?? 60,
        notifyInApp: input.notifyInApp ?? true,
      },
    });
    return toRuleConfig(row);
  }

  async updateRule(userId: string, ruleId: string, input: Partial<AlertRuleConfig>): Promise<AlertRuleConfig | null> {
    const existing = await this.prisma.alertRule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) return null;
    const row = await this.prisma.alertRule.update({
      where: { id: ruleId },
      data: {
        enabled: input.enabled ?? existing.enabled,
        symbol: input.symbol !== undefined ? input.symbol : existing.symbol,
        threshold: input.threshold !== undefined ? input.threshold : existing.threshold,
        severity: input.severity ? (input.severity.toUpperCase() as DbAlertRule["severity"]) : existing.severity,
        cooldownMinutes: input.cooldownMinutes ?? existing.cooldownMinutes,
        notifyInApp: input.notifyInApp ?? existing.notifyInApp,
      },
    });
    return toRuleConfig(row);
  }

  async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const existing = await this.prisma.alertRule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) return false;
    await this.prisma.alertRule.delete({ where: { id: ruleId } });
    return true;
  }
}
