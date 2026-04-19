export type AuthErrorCode =
  | "INVALID_CONFIG"
  | "DISCOVERY_FAILED" | "NETWORK_TIMEOUT" | "NETWORK_ERROR" | "OFFLINE"
  | "OAUTH_POPUP_BLOCKED" | "OAUTH_POPUP_CLOSED" | "OAUTH_POPUP_TIMEOUT"
  | "OAUTH_STATE_MISMATCH" | "OAUTH_FAILED"
  | "FEDCM_ISS_MISMATCH" | "FEDCM_DISMISSED"
  | "TOKEN_EXCHANGE_FAILED" | "TOKEN_REFRESH_FAILED" | "TOKEN_EXPIRED"
  | "DPOP_NONCE_REQUIRED" | "DPOP_INVALID_PROOF"
  | "REFRESH_REUSE_DETECTED"
  | "STORAGE_CORRUPTION" | "STORAGE_QUOTA_EXCEEDED"
  | "CRYPTO_UNSUPPORTED" | "WORKER_UNAVAILABLE"
  | "LOGGED_OUT_ELSEWHERE" | "SECURITY_WIPE"
  | "API_UNAUTHORIZED" | "API_FORBIDDEN" | "API_NOT_FOUND"
  | "API_VALIDATION" | "API_SERVER_ERROR"
  | "AVATAR_TOO_LARGE"
  | "AVATAR_TYPE_UNSUPPORTED"
  | "AVATAR_DIMENSIONS_EXCEEDED";

const NON_RETRYABLE: Record<string, true> = {
  INVALID_CONFIG: true,
  REFRESH_REUSE_DETECTED: true,
  CRYPTO_UNSUPPORTED: true,
  FEDCM_ISS_MISMATCH: true,
  OAUTH_STATE_MISMATCH: true,
  SECURITY_WIPE: true,
  AVATAR_TOO_LARGE: true,
  AVATAR_TYPE_UNSUPPORTED: true,
  AVATAR_DIMENSIONS_EXCEEDED: true,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly cause?: unknown;
  readonly retryable: boolean;
  readonly traceId?: string;

  constructor(code: AuthErrorCode, message: string, cause?: unknown, traceId?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.cause = cause;
    this.traceId = traceId;
    this.retryable = !NON_RETRYABLE[code];
  }
}
