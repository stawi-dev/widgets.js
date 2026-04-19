import type { AuthState, SecurityEvent, ResolvedConfig } from "./types.js";
import type { AuthErrorCode } from "./errors.js";

export interface SerializedError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
  traceId?: string;
}

export type Request =
  | { type: "init"; correlationId: string; config: ResolvedConfig }
  | { type: "state"; correlationId: string }
  | { type: "prepare-auth"; correlationId: string }
  | { type: "complete-auth"; correlationId: string; code: string; state: string; verifier: string; expectedState: string }
  | { type: "fedcm-exchange"; correlationId: string; idToken: string }
  | { type: "fetch"; correlationId: string; path: string; method: string; headers?: Record<string,string>; body?: ArrayBuffer | string | null; timeoutMs?: number }
  | { type: "upload"; correlationId: string; path: string; fileName: string; fileType: string; bytes: ArrayBuffer; timeoutMs?: number }
  | { type: "getRoles"; correlationId: string }
  | { type: "logout"; correlationId: string }
  | { type: "destroy"; correlationId: string };

export type Event =
  | { type: "ready"; correlationId: string }
  | { type: "state"; state: AuthState }
  | { type: "auth-url"; correlationId: string; authUrl: string; state: string; verifier: string }
  | { type: "response"; correlationId: string; status: number; headers: Record<string,string>; body: ArrayBuffer }
  | { type: "error"; correlationId: string; error: SerializedError }
  | { type: "ok"; correlationId: string }
  | { type: "roles"; correlationId: string; roles: string[] }
  | { type: "securityEvent"; event: SecurityEvent };
