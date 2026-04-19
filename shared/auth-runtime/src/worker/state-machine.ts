import type { AuthState, SecurityEvent } from "../shared/types.js";
import type { AuthErrorCode } from "../shared/errors.js";

export interface ReducerError { code: AuthErrorCode; message: string; retryable: boolean; }

export type Input =
  | { kind: "init_done"; hasTokens: boolean }
  | { kind: "sign_in_start" }
  | { kind: "sign_in_done" }
  | { kind: "sign_in_fail"; error: ReducerError }
  | { kind: "refresh_start" }
  | { kind: "refresh_done" }
  | { kind: "refresh_fail"; error: ReducerError; wipe: boolean }
  | { kind: "logout" }
  | { kind: "security_wipe"; reason: SecurityEvent["type"] };

export function reduce(state: AuthState, input: Input): AuthState {
  switch (input.kind) {
    case "init_done": return input.hasTokens ? "authenticated" : "unauthenticated";
    case "sign_in_start": return "initializing";
    case "sign_in_done": return "authenticated";
    case "sign_in_fail": return "unauthenticated";
    case "refresh_start": return "refreshing";
    case "refresh_done": return "authenticated";
    case "refresh_fail": return "unauthenticated";
    case "logout": return "unauthenticated";
    case "security_wipe": return "unauthenticated";
    default: return state;
  }
}
