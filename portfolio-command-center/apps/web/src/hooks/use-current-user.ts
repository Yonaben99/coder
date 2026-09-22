"use client";

import { useApiQuery } from "./use-api-query";

export interface CurrentUser {
  id: string;
  email: string;
}

export function useCurrentUser() {
  return useApiQuery<{ user: CurrentUser }>("/api/v1/auth/me");
}
