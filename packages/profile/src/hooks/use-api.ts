import { useMemo } from "react";
import { useAuth } from "./use-auth.js";
import type { ApiClient } from "@stawi/auth-runtime";

export function useApi(): ApiClient {
  const { runtime } = useAuth();
  return useMemo(() => runtime.getApiClient(), [runtime]);
}
