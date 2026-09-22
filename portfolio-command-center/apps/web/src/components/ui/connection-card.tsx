import Link from "next/link";
import type { ConnectionInfo } from "@pcc/shared";
import { IntegrationStatusBadge } from "./status-badge";

export function ConnectionCard({ connection }: { connection: ConnectionInfo }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-[var(--text-primary)]">{connection.label}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          {connection.lastSuccessfulSyncAt
            ? `Last synced ${new Date(connection.lastSuccessfulSyncAt).toLocaleString()}`
            : "Never synced"}
        </p>
        {connection.detail && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{connection.detail}</p>}
      </div>
      <div className="flex items-center gap-3">
        <IntegrationStatusBadge status={connection.status} />
        {connection.key === "ibkr" ? (
          <Link
            href="/settings/ibkr"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]"
          >
            Manage
          </Link>
        ) : (
          connection.capabilities.includes("test_connection") && (
            <button
              type="button"
              disabled
              title="Available once this integration is implemented"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] disabled:cursor-not-allowed"
            >
              Test connection
            </button>
          )
        )}
      </div>
    </div>
  );
}
