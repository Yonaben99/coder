import type { SystemEventLogger } from "../scheduler/system-event-logger.js";
import type { AlertNotificationPayload, NotificationProvider } from "./notification-provider.js";

/**
 * The in-app channel: the Alert row created by AlertEngine.raise already
 * IS the in-app notification (the Updates page reads it directly) — there
 * is no separate "send" step the way email/push would need, so this
 * provider's real, verifiable side effect is a SystemEvent audit entry
 * rather than a no-op. This is the only implemented channel; do not claim
 * email/push exist (docs/ALERTS_AND_MONITORING.md §6).
 */
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = "in-app";

  constructor(private readonly systemEvents: SystemEventLogger) {}

  async notify(payload: AlertNotificationPayload): Promise<void> {
    await this.systemEvents.log("alerts", "INFO", `alert delivered in-app: ${payload.title}`, {
      alertId: payload.alertId,
      userId: payload.userId,
      severity: payload.severity,
    });
  }
}
