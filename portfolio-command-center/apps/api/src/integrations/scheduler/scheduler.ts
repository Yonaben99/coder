import type { MonitoringStatus } from "@pcc/shared";
import type { JobDefinition, JobStatus } from "./job.js";
import type { SystemEventLogger } from "./system-event-logger.js";

const MAX_BACKOFF_MULTIPLIER = 4;

/**
 * A persistent-process scheduler (docs/ALERTS_AND_MONITORING.md §2) —
 * self-rescheduling per job via setTimeout rather than a fixed
 * setInterval, so a job's own interval can grow under repeated failure
 * (a simple capped-doubling backoff) and shrink back to normal on the
 * next success. Each run is wrapped in try/catch and logged via
 * SystemEventLogger; one job's failure never stops the others (§6.14 "one
 * provider failure does not take down the entire application").
 */
export class Scheduler {
  private readonly jobs = new Map<string, JobDefinition>();
  private readonly statuses = new Map<string, JobStatus>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly backoffMultiplier = new Map<string, number>();
  private running = false;

  constructor(private readonly systemEvents: SystemEventLogger) {}

  register(job: JobDefinition): void {
    this.jobs.set(job.name, job);
    this.statuses.set(job.name, { name: job.name, intervalMinutes: job.intervalMinutes, lastRunAt: null, lastSuccessAt: null, lastError: null });
    this.backoffMultiplier.set(job.name, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const job of this.jobs.values()) this.scheduleNext(job, job.intervalMinutes);
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Runs every registered job once immediately, ignoring the schedule — used by tests and the manual "run now" path. */
  async runAllOnce(): Promise<void> {
    await Promise.all([...this.jobs.values()].map((job) => this.runJob(job, { reschedule: false })));
  }

  private scheduleNext(job: JobDefinition, delayMinutes: number): void {
    if (!this.running) return;
    const timer = setTimeout(() => void this.runJob(job, { reschedule: true }), delayMinutes * 60 * 1000);
    timer.unref?.(); // never keep the process (or test teardown) alive just for a scheduled job
    this.timers.set(job.name, timer);
  }

  private async runJob(job: JobDefinition, options: { reschedule: boolean }): Promise<void> {
    const status = this.statuses.get(job.name);
    if (!status) return;
    status.lastRunAt = new Date();
    await this.systemEvents.log("scheduler", "INFO", `job started: ${job.name}`);

    try {
      await job.run();
      status.lastSuccessAt = new Date();
      status.lastError = null;
      this.backoffMultiplier.set(job.name, 1);
      await this.systemEvents.log("scheduler", "INFO", `job completed: ${job.name}`);
      if (options.reschedule) this.scheduleNext(job, job.intervalMinutes);
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : "Unknown job error";
      await this.systemEvents.log("scheduler", "ERROR", `job failed: ${job.name}`, { error: status.lastError });
      if (options.reschedule) {
        const nextMultiplier = Math.min((this.backoffMultiplier.get(job.name) ?? 1) * 2, MAX_BACKOFF_MULTIPLIER);
        this.backoffMultiplier.set(job.name, nextMultiplier);
        this.scheduleNext(job, job.intervalMinutes * nextMultiplier);
      }
    }
  }

  getStatus(): MonitoringStatus {
    return {
      schedulerRunning: this.running,
      jobs: [...this.statuses.values()].map((s) => ({
        name: s.name,
        intervalMinutes: s.intervalMinutes,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        lastError: s.lastError,
      })),
    };
  }
}
