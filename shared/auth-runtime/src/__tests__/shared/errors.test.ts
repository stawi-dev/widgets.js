import { describe, it, expect } from "vitest";
import { AuthError } from "../../shared/errors.js";

describe("AuthError", () => {
  it("preserves code, message, cause, and retryable flag", () => {
    const e = new AuthError("NETWORK_TIMEOUT", "boom", new Error("x"));
    expect(e.code).toBe("NETWORK_TIMEOUT");
    expect(e.message).toBe("boom");
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.name).toBe("AuthError");
    expect(e.retryable).toBe(true);
  });
  it("marks non-retryable codes", () => {
    expect(new AuthError("INVALID_CONFIG", "m").retryable).toBe(false);
    expect(new AuthError("REFRESH_REUSE_DETECTED", "m").retryable).toBe(false);
  });
});
