import type { PrismaClient } from "@pcc/db";
import type { SystemEventLogger } from "../scheduler/system-event-logger.js";
import { ALWAYS_ON_DETECTORS, RULE_GATED_DETECTORS } from "./detectors.js";
import type { NotificationProvider } from "./notification-provider.js";
import type { AlertServices, RaiseAlertInput } from "./types.js";

/**
 * Deterministic detection first, notification second (§6.9 — no LLM call
 * happens anywhere in this class or the detectors it runs). Every
 * detector reads already-normalized application services
 * (PortfolioDataSource, NewsDataSource, etc.) — never a vendor directly.
 * Cooldown/dedup (§6.4) lives entirely in `raise()`: the same dedupeKey
 * within the rule's cooldown window updates the existing Alert's
 * lastDetectedAt instead of creating a new row or renotifying.
 */
export class AlertEngine {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly services: AlertServices,
    private readonly notificationProvider: NotificationProvider,
    private readonly systemEvents: SystemEventLogger,
  ) {}

  async evaluateForUser(userId: string): Promise<void> {
    for (const detector of ALWAYS_ON_DETECTORS) {
      await detector(userId, null, this.services, (input) => this.raise(userId, null, input));
    }

    const rules = await this.prisma.alertRule.findMany({ where: { userId, enabled: true } });
    for (const rule of rules) {
      const detector = RULE_GATED_DETECTORS[rule.category];
      if (!detector) continue;
      await detector(userId, rule, this.services, (input) => this.raise(userId, rule.id, input));
    }
  }

  private async raise(userId: string, ruleId: string | null, input: RaiseAlertInput): Promise<void> {
    const now = new Date();
    const existing = await this.prisma.alert.findFirst({ where: { userId, dedupeKey: input.dedupeKey } });

    if (existing) {
      const cooldownMs = input.cooldownMinutes * 60 * 1000;
      const withinCooldown = now.getTime() - existing.lastDetectedAt.getTime() < cooldownMs;
      if (withinCooldown) {
        await this.prisma.alert.update({ where: { id: existing.id }, data: { lastDetectedAt: now } });
        await this.systemEvents.log("alerts", "INFO", `alert suppressed by cooldown: ${input.dedupeKey}`);
        return;
      }

      await this.prisma.alert.update({
        where: { id: existing.id },
        data: {
          ruleId,
          lastDetectedAt: now,
          status: "TRIGGERED",
          readState: "NEW",
          severity: input.severity,
          title: input.title,
          explanation: input.explanation,
          sourceUrl: input.sourceUrl ?? null,
          condition: input.condition as never,
          triggeredAt: now,
        },
      });
      await this.notificationProvider.notify({ alertId: existing.id, userId, title: input.title, severity: input.severity });
      await this.systemEvents.log("alerts", "INFO", `alert re-triggered: ${input.dedupeKey}`);
      return;
    }

    const created = await this.prisma.alert.create({
      data: {
        userId,
        ruleId,
        category: input.category,
        symbol: input.symbol,
        severity: input.severity,
        title: input.title,
        explanation: input.explanation,
        sourceUrl: input.sourceUrl ?? null,
        condition: input.condition as never,
        status: "TRIGGERED",
        readState: "NEW",
        dedupeKey: input.dedupeKey,
        firstDetectedAt: now,
        lastDetectedAt: now,
        triggeredAt: now,
      },
    });
    await this.notificationProvider.notify({ alertId: created.id, userId, title: input.title, severity: input.severity });
    await this.systemEvents.log("alerts", "INFO", `alert generated: ${input.dedupeKey}`);
  }
}
