export type AuthErrorCode =
  | "FEDCM_NOT_SUPPORTED"
  | "FEDCM_FAILED"
  | "OAUTH_POPUP_BLOCKED"
  | "OAUTH_POPUP_CLOSED"
  | "OAUTH_FAILED"
  | "TOKEN_EXCHANGE_FAILED"
  | "TOKEN_REFRESH_FAILED"
  | "TOKEN_EXPIRED"
  | "NETWORK_ERROR"
  | "INVALID_CONFIG"
  | "LOGOUT_FAILED"
  | "UNKNOWN";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly cause?: unknown;

  constructor(code: AuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.cause = cause;
  }
}
