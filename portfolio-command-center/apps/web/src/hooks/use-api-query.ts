"use client";

import { useEffect, useState } from "react";
import { ApiError, apiClient } from "@/lib/api-client";

export type ApiQueryState<T> =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

export function useApiQuery<T>(path: string, deps: unknown[] = []): ApiQueryState<T> {
  const [state, setState] = useState<ApiQueryState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    apiClient
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }
        setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return state;
}
