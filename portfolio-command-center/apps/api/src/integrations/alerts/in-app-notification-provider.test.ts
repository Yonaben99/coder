import { describe, expect, it, vi } from "vitest";
import { InAppNotificationProvider } from "./in-app-notification-provider.js";
import type { SystemEventLogger } from "../scheduler/system-event-logger.js";

describe("InAppNotificationProvider", () => {
  it("logs a real SystemEvent rather than silently no-opping", async () => {
    const log = vi.fn(async () => undefined);
    const systemEvents = { log } as unknown as SystemEventLogger;
    const provider = new InAppNotificationProvider(systemEvents);

    await provider.notify({ alertId: "alert-1", userId: "user-1", title: "WDC moved +6%", severity: "WARNING" });

    expect(log).toHaveBeenCalledWith(
      "alerts",
      "INFO",
      expect.stringContaining("WDC moved +6%"),
      expect.objectContaining({ alertId: "alert-1", userId: "user-1", severity: "WARNING" }),
    );
  });
});
