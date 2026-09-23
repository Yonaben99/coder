export interface JobDefinition {
  name: string;
  /** Base interval between runs. Actual delay is multiplied by a backoff factor after consecutive failures (see scheduler.ts). */
  intervalMinutes: number;
  run: () => Promise<void>;
}

export interface JobStatus {
  name: string;
  intervalMinutes: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
}
