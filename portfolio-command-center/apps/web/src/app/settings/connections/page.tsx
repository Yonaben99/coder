"use client";

import type { ConnectionInfo } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConnectionCard } from "@/components/ui/connection-card";

function ConnectionsContent() {
  const connections = useApiQuery<{ connections: ConnectionInfo[] }>("/api/v1/connections");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>🔌</span> Connections
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">
        A connection is only marked Operational once a real connection test has succeeded — never on assumption.
      </p>

      {connections.status === "loading" && <LoadingState label="Checking connections…" />}
      {connections.status === "error" && <ErrorState message={connections.message} />}
      {connections.status === "success" && (
        <div className="flex flex-col gap-3">
          {connections.data.connections.map((connection) => (
            <ConnectionCard key={connection.key} connection={connection} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <AuthGate>
      <ConnectionsContent />
    </AuthGate>
  );
}
