export interface AlertNotificationPayload {
  alertId: string;
  userId: string;
  title: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

/**
 * A delivery channel for an already-created Alert row. The Alert row
 * itself (written by AlertEngine.raise, see alert-engine.ts) is the
 * durable record and what the API/UI read — a NotificationProvider's job
 * is any *additional* delivery step a channel needs (see
 * docs/ALERTS_AND_MONITORING.md §6). Swapping/adding a channel (email,
 * push) means writing a new class implementing this interface.
 */
export interface NotificationProvider {
  readonly name: string;
  notify(payload: AlertNotificationPayload): Promise<void>;
}
