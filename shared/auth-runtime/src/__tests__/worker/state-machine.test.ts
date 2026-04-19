import { describe, it, expect } from "vitest";
import { reduce } from "../../worker/state-machine.js";

describe("state-machine", () => {
  const err = { code: "TOKEN_REFRESH_FAILED" as const, message: "x", retryable: true };

  it("init with tokens → authenticated; without → unauthenticated", () => {
    expect(reduce("initializing", { kind: "init_done", hasTokens: true })).toBe("authenticated");
    expect(reduce("initializing", { kind: "init_done", hasTokens: false })).toBe("unauthenticated");
  });

  it("sign-in transitions", () => {
    expect(reduce("unauthenticated", { kind: "sign_in_start" })).toBe("initializing");
    expect(reduce("initializing", { kind: "sign_in_done" })).toBe("authenticated");
    expect(reduce("initializing", { kind: "sign_in_fail", error: err })).toBe("unauthenticated");
  });

  it("refresh transitions", () => {
    expect(reduce("authenticated", { kind: "refresh_start" })).toBe("refreshing");
    expect(reduce("refreshing", { kind: "refresh_done" })).toBe("authenticated");
    expect(reduce("refreshing", { kind: "refresh_fail", error: err, wipe: true })).toBe("unauthenticated");
  });

  it("logout from any state → unauthenticated", () => {
    expect(reduce("authenticated", { kind: "logout" })).toBe("unauthenticated");
    expect(reduce("refreshing", { kind: "logout" })).toBe("unauthenticated");
  });

  it("security_wipe → unauthenticated", () => {
    expect(reduce("refreshing", { kind: "security_wipe", reason: "refresh_reuse_detected" })).toBe("unauthenticated");
  });
});
