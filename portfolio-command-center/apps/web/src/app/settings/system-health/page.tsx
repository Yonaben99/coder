"use client";

import type { IntegrationHealth } from "@pcc/shared";
import { AuthGate } from "@/components/layout/auth-gate";
import { useApiQuery } from "@/hooks/use-api-query";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { IntegrationStatusBadge } from "@/components/ui/status-badge";

function HealthCard({ service }: { service: IntegrationHealth }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-[var(--text-primary)]">{service.label}</p>
        <IntegrationStatusBadge status={service.status} />
      </div>
      {service.detail && <p className="text-xs text-[var(--text-tertiary)]">{service.detail}</p>}
      <p className="text-xs text-[var(--text-tertiary)]">
        {service.lastCheckedAt ? `Checked ${new Date(service.lastCheckedAt).toLocaleTimeString()}` : "Never checked"}
      </p>
    </div>
  );
}

function SystemHealthContent() {
  const health = useApiQuery<{ services: IntegrationHealth[] }>("/api/v1/system-health");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>🩺</span> System Health
      </h1>

      {health.status === "loading" && <LoadingState label="Running health checks…" />}
      {health.status === "error" && <ErrorState message={health.message} />}
      {health.status === "success" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.data.services.map((service) => (
            <HealthCard key={service.key} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  return (
    <AuthGate>
      <SystemHealthContent />
    </AuthGate>
  );
}
