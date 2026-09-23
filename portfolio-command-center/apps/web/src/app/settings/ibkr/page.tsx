"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/layout/auth-gate";
import { apiClient, ApiError } from "@/lib/api-client";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeader } from "@/components/ui/section-header";

interface IbkrStatus {
  gateway: "reachable" | "unreachable";
  brokerageSession: "connected" | "disconnected";
  authentication: "authenticated" | "unauthenticated";
  accountData: "available" | "unavailable";
  marketData: "available" | "unavailable";
  lastSuccessfulSync: string | null;
  lastError: string | null;
}

interface MaskedAccount {
  accountId: string;
  masked: string;
}

interface AccountsResponse {
  accounts: MaskedAccount[];
  selectedAccountId: string | null;
  reason?: string;
}

function StateRow({ label, ok, okLabel, badLabel }: { label: string; ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3 last:border-b-0">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className={`text-sm font-medium ${ok ? "text-[var(--color-positive)]" : "text-[var(--text-tertiary)]"}`}>
        {ok ? `🟢 ${okLabel}` : `⚪ ${badLabel}`}
      </span>
    </div>
  );
}

function IbkrSettingsContent() {
  const [status, setStatus] = useState<IbkrStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statusResult, accountsResult] = await Promise.all([
        apiClient.get<IbkrStatus>("/api/v1/integrations/ibkr/status"),
        apiClient.get<AccountsResponse>("/api/v1/portfolio/account"),
      ]);
      setStatus(statusResult);
      setAccounts(accountsResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load IBKR status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTest() {
    setTesting(true);
    try {
      const result = await apiClient.post<IbkrStatus>("/api/v1/integrations/ibkr/test");
      setStatus(result);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSelectAccount(accountId: string) {
    try {
      await apiClient.post("/api/v1/portfolio/account", { accountId });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to switch accounts.");
    }
  }

  if (loading) return <LoadingState label="Checking IBKR connection…" />;
  if (error && !status) return <ErrorState message={error} onRetry={load} />;

  const connected = status?.authentication === "authenticated";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
        <span aria-hidden>🏦</span> IBKR
      </h1>

      <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <SectionHeader title="Connection state" icon="🔌" />
        {status ? (
          <div className="flex flex-col">
            <StateRow label="Gateway" ok={status.gateway === "reachable"} okLabel="Reachable" badLabel="Not reachable" />
            <StateRow label="Brokerage session" ok={status.brokerageSession === "connected"} okLabel="Connected" badLabel="Disconnected" />
            <StateRow label="Authentication" ok={status.authentication === "authenticated"} okLabel="Authenticated" badLabel="Not authenticated" />
            <StateRow label="Account data" ok={status.accountData === "available"} okLabel="Available" badLabel="Not yet available" />
            <StateRow label="Market data" ok={status.marketData === "available"} okLabel="Available" badLabel="Not yet available" />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No status yet.</p>
        )}
        {status?.lastError && (
          <p className="mt-3 rounded-md bg-[var(--color-negative-muted)] px-3 py-2 text-xs text-[var(--color-negative)]">
            {status.lastError}
          </p>
        )}
        {status?.lastSuccessfulSync && (
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Last successful sync: {new Date(status.lastSuccessfulSync).toLocaleString()}
          </p>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="mt-4 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test IBKR Connection"}
        </button>
      </section>

      {!connected && (
        <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <SectionHeader title="Setup instructions" icon="📋" />
          <ol className="list-inside list-decimal space-y-2 text-sm text-[var(--text-secondary)]">
            <li>
              Install and run the IBKR Client Portal Gateway on a machine you control (never on a server you don&rsquo;t
              trust with your session) — download it from IBKR&rsquo;s own site.
            </li>
            <li>
              Open the gateway&rsquo;s login page in your own browser (typically{" "}
              <code className="font-numeric rounded bg-[var(--surface-overlay)] px-1">https://localhost:5000</code>) and
              sign in with your normal IBKR username, password, and 2FA. This app never sees that password.
            </li>
            <li>
              Set <code className="font-numeric rounded bg-[var(--surface-overlay)] px-1">IBKR_GATEWAY_BASE_URL</code> in
              the backend&rsquo;s environment to the gateway&rsquo;s API URL and restart the backend.
            </li>
            <li>Press &ldquo;Test IBKR Connection&rdquo; above.</li>
          </ol>
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            Full details: <code className="font-numeric">docs/IBKR_INTEGRATION.md</code>.
          </p>
        </section>
      )}

      {accounts && accounts.accounts.length > 0 && (
        <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <SectionHeader title="Account" icon="🏦" />
          {accounts.accounts.length === 1 ? (
            <p className="font-numeric text-sm text-[var(--text-primary)]">{accounts.accounts[0]?.masked}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.accounts.map((acct) => (
                <label key={acct.accountId} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="radio"
                    name="ibkr-account"
                    checked={accounts.selectedAccountId === acct.accountId}
                    onChange={() => void handleSelectAccount(acct.accountId)}
                  />
                  <span className="font-numeric">{acct.masked}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function IbkrSettingsPage() {
  return (
    <AuthGate>
      <IbkrSettingsContent />
    </AuthGate>
  );
}
