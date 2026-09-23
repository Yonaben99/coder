import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "./scheduler.js";
import type { SystemEventLogger } from "./system-event-logger.js";

function fakeLogger(): SystemEventLogger {
  return { log: vi.fn(async () => undefined) } as unknown as SystemEventLogger;
}

describe("Scheduler — registration and status", () => {
  it("reports each registered job's interval before it has ever run", () => {
    const scheduler = new Scheduler(fakeLogger());
    scheduler.register({ name: "jobA", intervalMinutes: 10, run: async () => undefined });
    const status = scheduler.getStatus();
    expect(status.schedulerRunning).toBe(false);
    expect(status.jobs).toEqual([{ name: "jobA", intervalMinutes: 10, lastRunAt: null, lastSuccessAt: null, lastError: null }]);
  });
});

describe("Scheduler — runAllOnce", () => {
  it("runs every registered job immediately and records success", async () => {
    const scheduler = new Scheduler(fakeLogger());
    let ran = false;
    scheduler.register({
      name: "jobA",
      intervalMinutes: 10,
      run: async () => {
        ran = true;
      },
    });

    await scheduler.runAllOnce();
    expect(ran).toBe(true);
    const status = scheduler.getStatus().jobs[0]!;
    expect(status.lastRunAt).toBeTruthy();
    expect(status.lastSuccessAt).toBeTruthy();
    expect(status.lastError).toBeNull();
  });

  it("records a job's failure without throwing or affecting other jobs", async () => {
    const scheduler = new Scheduler(fakeLogger());
    let otherRan = false;
    scheduler.register({
      name: "failing",
      intervalMinutes: 10,
      run: async () => {
        throw new Error("boom");
      },
    });
    scheduler.register({
      name: "healthy",
      intervalMinutes: 10,
      run: async () => {
        otherRan = true;
      },
    });

    await expect(scheduler.runAllOnce()).resolves.toBeUndefined();
    expect(otherRan).toBe(true);

    const statuses = scheduler.getStatus().jobs;
    const failing = statuses.find((s) => s.name === "failing")!;
    const healthy = statuses.find((s) => s.name === "healthy")!;
    expect(failing.lastError).toBe("boom");
    expect(healthy.lastError).toBeNull();
  });

  it("logs job started/completed via the SystemEventLogger", async () => {
    const logger = fakeLogger();
    const scheduler = new Scheduler(logger);
    scheduler.register({ name: "jobA", intervalMinutes: 10, run: async () => undefined });

    await scheduler.runAllOnce();
    expect(logger.log).toHaveBeenCalledWith("scheduler", "INFO", "job started: jobA");
    expect(logger.log).toHaveBeenCalledWith("scheduler", "INFO", "job completed: jobA");
  });
});

describe("Scheduler — start/stop with self-rescheduling backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reschedules a failing job with a longer (capped) delay, and resets to the base interval on success", async () => {
    const scheduler = new Scheduler(fakeLogger());
    let callCount = 0;
    let shouldFail = true;
    scheduler.register({
      name: "jobA",
      intervalMinutes: 1,
      run: async () => {
        callCount++;
        if (shouldFail) throw new Error("still failing");
      },
    });

    scheduler.start();
    expect(scheduler.isRunning).toBe(true);

    // First run at t=1min fails -> backoff doubles -> next run scheduled at 2min out.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(callCount).toBe(1);

    // Not yet due at the base 1-minute interval (backoff pushed it to 2 minutes).
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(callCount).toBe(1);

    // Due now, and this run succeeds.
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(callCount).toBe(2);

    // Backoff should have reset — next run happens after the base interval again, not the doubled one.
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(callCount).toBe(3);
  });

  it("stop() clears pending timers so no further runs happen", async () => {
    const scheduler = new Scheduler(fakeLogger());
    let callCount = 0;
    scheduler.register({
      name: "jobA",
      intervalMinutes: 1,
      run: async () => {
        callCount++;
      },
    });

    scheduler.start();
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(callCount).toBe(0);
  });
});
