import { useAuth } from "./use-auth.js";
import type { AuthRuntime } from "@stawi/auth-runtime";

export function useApi(): AuthRuntime {
  return useAuth().runtime;
}
