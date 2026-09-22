"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export function AuthGate({ children }: { children: ReactNode }) {
  const state = useCurrentUser();

  if (state.status === "loading") {
    return <LoadingState label="Checking your session…" />;
  }

  if (state.status === "unauthenticated") {
    return (
      <EmptyState
        icon="🔒"
        title="Sign in required"
        description="This page shows account-specific data, so you need to sign in first."
        action={
          <Link
            href="/login"
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            Sign in
          </Link>
        }
      />
    );
  }

  if (state.status === "error") {
    return <ErrorState message={state.message} />;
  }

  return <>{children}</>;
}
