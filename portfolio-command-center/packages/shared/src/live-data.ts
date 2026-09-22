/**
 * Every value sourced from a live integration (IBKR, market data, news, AI)
 * is wrapped in this envelope so the UI can never present stale or
 * unavailable data as live by accident — the source, timestamp, and status
 * travel with the value itself instead of being inferred client-side.
 */
export type LiveDataStatus = "live" | "delayed" | "unavailable";

export interface LiveDataMeta {
  source: string;
  /** ISO 8601 timestamp of when this value was fetched, or null if never fetched. */
  timestamp: string | null;
  status: LiveDataStatus;
  /** Required when status is "unavailable" — the real reason, shown to the user. */
  reason?: string;
}

export interface LiveData<T> {
  data: T | null;
  meta: LiveDataMeta;
}

export function unavailable<T>(source: string, reason: string): LiveData<T> {
  return { data: null, meta: { source, timestamp: null, status: "unavailable", reason } };
}
