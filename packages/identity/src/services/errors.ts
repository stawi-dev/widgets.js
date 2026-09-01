/**
 * Error raised by the identity data layer. `code` carries the Connect
 * error code from a stream trailer (e.g. "permission_denied") or a
 * client-side code for malformed responses.
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
