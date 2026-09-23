import type { PrismaClient, SystemEventLevel } from "@pcc/db";

/**
 * Durable observability trail for the scheduler and alert engine (job
 * started/completed/failed, provider unavailable, alert generated/
 * suppressed) — reuses the existing SystemEvent model (Phase 1 schema,
 * previously unused) rather than inventing a new one. Never logs secrets:
 * callers pass structured metadata, never raw request/response bodies.
 */
export class SystemEventLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async log(component: string, level: SystemEventLevel, message: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.systemEvent.create({
      data: { component, level, message, metadata: metadata as never },
    });
  }
}
