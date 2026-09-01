/**
 * Error raised by the identity data layer. `code` carries the Connect
 * error code (e.g. "permission_denied") when the server supplied one,
 * an `@stawi/auth-runtime` `AuthError` code when it did not, or a
 * client-side code ("invalid_response", "unsupported") for responses
 * this client cannot make sense of.
 */
export class IdentityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

/**
 * Builds an `IdentityError` whose message carries the code too, so the
 * raw `Error` string stays diagnosable in logs and toasts that never
 * look at `.code`.
 */
export function identityError(code: string, detail?: string): IdentityError {
  return new IdentityError(code, detail ? `${code}: ${detail}` : code);
}

/** Connect error shape, both as a unary body and inside a stream trailer. */
export interface ConnectError {
  code?: unknown;
  message?: unknown;
}

/**
 * Turns a Connect error object into an `IdentityError`, or returns
 * undefined when the value carries no usable `code`.
 */
export function fromConnectError(value: unknown): IdentityError | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { code, message } = value as ConnectError;
  if (typeof code !== "string" || code.length === 0) return undefined;
  return identityError(
    code,
    typeof message === "string" && message.length > 0 ? message : undefined,
  );
}

/**
 * Normalises anything thrown by `runtime.fetch` into an `IdentityError`.
 *
 * The auth runtime raises an `AuthError` on a non-2xx response whose
 * message embeds the response body (`API 403: {"code":…,"message":…}`),
 * so the server's own Connect error is recovered from there when
 * present; otherwise the `AuthError` code and message are kept.
 */
export function toIdentityError(err: unknown): IdentityError {
  if (err instanceof IdentityError) return err;

  const raw = err as { code?: unknown; message?: unknown } | null;
  const message =
    raw && typeof raw.message === "string" ? raw.message : String(err);

  const embedded = fromConnectError(parseEmbeddedJson(message));
  if (embedded) return embedded;

  const code = raw && typeof raw.code === "string" ? raw.code : "unknown";
  return identityError(code, message);
}

/** Extracts the JSON object embedded in an `API <status>: <body>` message. */
function parseEmbeddedJson(message: string): unknown {
  const start = message.indexOf("{");
  if (start === -1) return undefined;
  try {
    return JSON.parse(message.slice(start));
  } catch {
    // Truncated or non-JSON body — fall back to the transport error.
    return undefined;
  }
}
